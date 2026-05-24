import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  claimedSims: '@luxuryauthenticator/claimed_sims',
  lastOtpRequestTime: '@luxuryauthenticator/last_otp_request_',
  otpRequestCount: '@luxuryauthenticator/otp_request_count_',
  otpLockoutExpires: '@luxuryauthenticator/otp_lockout_expires_',
  activeOtpCode: '@luxuryauthenticator/active_otp_code_',
  wrongOtpAttempts: '@luxuryauthenticator/wrong_otp_attempts_',
};

const COOLDOWN_DURATION_MS = 1.5 * 60 * 60 * 1000; // 1.5 hours in milliseconds
const MAX_OTP_REQUESTS_IN_WINDOW = 3;
const MAX_WRONG_ATTEMPTS = 3;

export type OtpRequestResult =
  | { success: true; code: string; message: string }
  | { success: false; message: string; cooldownRemainingMs?: number };

export type OtpVerificationResult =
  | { success: true; message: string }
  | { success: false; message: string; isLockedOut?: boolean };

/**
 * Checks if a phone number/SIM has already claimed a free trial.
 */
export async function isSimAlreadyClaimed(phone: string): Promise<boolean> {
  const sanitized = phone.replace(/[^0-9+]/g, '');
  const raw = await AsyncStorage.getItem(KEYS.claimedSims);
  const claimed: string[] = raw ? JSON.parse(raw) : [];
  return claimed.includes(sanitized);
}

/**
 * Marks a SIM as having claimed a trial to prevent multiple enrollments.
 */
export async function registerClaimedSim(phone: string): Promise<void> {
  const sanitized = phone.replace(/[^0-9+]/g, '');
  const raw = await AsyncStorage.getItem(KEYS.claimedSims);
  const claimed: string[] = raw ? JSON.parse(raw) : [];
  if (!claimed.includes(sanitized)) {
    claimed.push(sanitized);
    await AsyncStorage.setItem(KEYS.claimedSims, JSON.stringify(claimed));
  }
}

/**
 * Requests a 6-digit phone verification OTP code.
 * Enforces a 1.5 hours SMS rate limiting, SIM deduplication, and lockout policies.
 */
export async function requestPhoneOtp(phone: string): Promise<OtpRequestResult> {
  const sanitized = phone.replace(/[^0-9+]/g, '');
  if (sanitized.length < 9) {
    return { success: false, message: 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาระบุเบอร์โทรศัพท์ที่ใช้งานได้' };
  }

  const now = Date.now();

  // 1. Rule: 1 SIM = 1 Trial
  const claimed = await isSimAlreadyClaimed(sanitized);
  if (claimed) {
    return {
      success: false,
      message: '🚫 หมายเลขโทรศัพท์นี้เคยรับสิทธิ์ทดลองใช้ Premium แล้ว (ข้อกำหนดสิทธิ์: 1 SIM = 1 สิทธิ์ทดลองใช้)',
    };
  }

  // 2. Check Lockout due to brute-force entries
  const lockoutExpiresStr = await AsyncStorage.getItem(KEYS.otpLockoutExpires + sanitized);
  if (lockoutExpiresStr) {
    const expires = parseInt(lockoutExpiresStr, 10);
    if (now < expires) {
      const remainingMs = expires - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return {
        success: false,
        message: `🚫 เบอร์โทรศัพท์นี้ถูกระงับชั่วคราวเป็นเวลา 1.5 ชั่วโมง เนื่องจากพยายามกรอกรหัสผิดเกินกำหนด กรุณาลองใหม่อีกครั้งในอีก ${remainingMinutes} นาที`,
        cooldownRemainingMs: remainingMs,
      };
    } else {
      // Lockout expired, clear attempts
      await AsyncStorage.removeItem(KEYS.otpLockoutExpires + sanitized);
      await AsyncStorage.setItem(KEYS.wrongOtpAttempts + sanitized, '0');
    }
  }

  // 3. Rule: 1.5 Hours Cooldown for SMS Requests
  const lastRequestStr = await AsyncStorage.getItem(KEYS.lastOtpRequestTime + sanitized);
  const requestCountStr = await AsyncStorage.getItem(KEYS.otpRequestCount + sanitized);
  
  let lastRequest = lastRequestStr ? parseInt(lastRequestStr, 10) : 0;
  let count = requestCountStr ? parseInt(requestCountStr, 10) : 0;

  if (now - lastRequest < COOLDOWN_DURATION_MS) {
    if (count >= MAX_OTP_REQUESTS_IN_WINDOW) {
      const remainingMs = COOLDOWN_DURATION_MS - (now - lastRequest);
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return {
        success: false,
        message: `🚫 คุณส่งขอรหัส OTP ถี่เกินไป เพื่อความปลอดภัยของระบบ กรุณารอ 1.5 ชั่วโมง (เหลืออีก ${remainingMinutes} นาที) เพื่อส่งขอรหัสใหม่อีกครั้ง`,
        cooldownRemainingMs: remainingMs,
      };
    }
    count += 1;
  } else {
    // Reset window
    lastRequest = now;
    count = 1;
  }

  // Save request rate status
  await AsyncStorage.setItem(KEYS.lastOtpRequestTime + sanitized, lastRequest.toString());
  await AsyncStorage.setItem(KEYS.otpRequestCount + sanitized, count.toString());

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await AsyncStorage.setItem(KEYS.activeOtpCode + sanitized, JSON.stringify({ code, expires: now + 5 * 60 * 1000 })); // 5 min expiry

  // In production: Connect to Supabase Auth OTP orTwilio/LINE SMS provider.
  // We log to the console for testing convenience.
  console.log(`[SMS-Verify] sending OTP ${code} to phone ${sanitized} (Thai SMS Twilio/LINE Notify Provider)`);

  return {
    success: true,
    code,
    message: `ส่งรหัส OTP 6 หลักไปยังเบอร์ ${sanitized} เรียบร้อยแล้ว (รหัสมีอายุการใช้งาน 5 นาที)`,
  };
}

/**
 * Verifies the 6-digit code. Lockout phone number for 1.5 hours if wrong 3 times.
 */
export async function verifyPhoneOtp(phone: string, enteredCode: string): Promise<OtpVerificationResult> {
  const sanitized = phone.replace(/[^0-9+]/g, '');
  const now = Date.now();

  // 1. Lockout check
  const lockoutExpiresStr = await AsyncStorage.getItem(KEYS.otpLockoutExpires + sanitized);
  if (lockoutExpiresStr) {
    const expires = parseInt(lockoutExpiresStr, 10);
    if (now < expires) {
      const remainingMinutes = Math.ceil((expires - now) / 60000);
      return {
        success: false,
        isLockedOut: true,
        message: `🚫 หมายเลขนี้ถูกระงับการขอหรือกรอกรหัสผ่าน 1.5 ชั่วโมงเนื่องจากระบุรหัสไม่ถูกต้อง (เหลืออีก ${remainingMinutes} นาที)`,
      };
    }
  }

  // 2. Read active code
  const activeStr = await AsyncStorage.getItem(KEYS.activeOtpCode + sanitized);
  if (!activeStr) {
    return { success: false, message: 'ไม่มีรหัส OTP ที่เปิดใช้งานสำหรับเบอร์นี้ กรุณากดส่งขอรหัส OTP ก่อน' };
  }

  const active = JSON.parse(activeStr) as { code: string; expires: number };
  if (now > active.expires) {
    return { success: false, message: 'รหัส OTP หมดอายุการใช้งานแล้ว กรุณากดส่งรหัสใหม่อีกครั้ง' };
  }

  // 3. Compare code
  if (active.code === enteredCode) {
    // Verified successfully! Register SIM immediately
    await registerClaimedSim(sanitized);
    await AsyncStorage.removeItem(KEYS.activeOtpCode + sanitized);
    await AsyncStorage.setItem(KEYS.wrongOtpAttempts + sanitized, '0');
    return { success: true, message: 'ยืนยันหมายเลขโทรศัพท์สำเร็จ เริ่มสิทธิ์ทดลองใช้งานฟรีได้ทันที!' };
  }

  // 4. Handle incorrect attempts
  const attemptsStr = await AsyncStorage.getItem(KEYS.wrongOtpAttempts + sanitized);
  const attempts = (attemptsStr ? parseInt(attemptsStr, 10) : 0) + 1;

  if (attempts >= MAX_WRONG_ATTEMPTS) {
    const lockoutTime = now + COOLDOWN_DURATION_MS;
    await AsyncStorage.setItem(KEYS.otpLockoutExpires + sanitized, lockoutTime.toString());
    await AsyncStorage.setItem(KEYS.wrongOtpAttempts + sanitized, '0');
    await AsyncStorage.removeItem(KEYS.activeOtpCode + sanitized);
    return {
      success: false,
      isLockedOut: true,
      message: '🚫 ระบุรหัสผ่านไม่ถูกต้องครบ 3 ครั้ง เพื่อความปลอดภัย ระบบได้ระงับการทำงานหมายเลขนี้เป็นเวลา 1.5 ชั่วโมง',
    };
  } else {
    await AsyncStorage.setItem(KEYS.wrongOtpAttempts + sanitized, attempts.toString());
    const remaining = MAX_WRONG_ATTEMPTS - attempts;
    return {
      success: false,
      message: `รหัส OTP ไม่ถูกต้อง (ระบุผิดอีก ${remaining} ครั้งจะถูกระงับการใช้งานเป็นเวลา 1.5 ชั่วโมง)`,
    };
  }
}
