import React from 'react';
import {
  View,
  ScrollView,
  Text,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, colors } from '../lib/theme';
import { useLanguage } from '../lib/localization';
import { styles } from './AppStyles';

// Hosted legal pages (GitHub Pages, free + always-updated).
// App Store / Google Play submission requires these URLs to be reachable.
const PRIVACY_URL = 'https://yuwathanont1234.github.io/Kritsada/legal/privacy.html';
const TERMS_URL = 'https://yuwathanont1234.github.io/Kritsada/legal/terms.html';

export default function InfoScreen({ route, navigation }: any) {
  const { t, lang } = useLanguage();
  const kind = route?.params?.kind || 'faq';

  const renderContent = () => {
    if (kind === 'faq') {
      if (lang === 'th') {
        return (
          <View style={styles.infoContentContainer}>
            <Text style={styles.infoSectionHeader}>1. ระบบการตรวจสอบความแท้ด้วย AI ทำงานอย่างไร?</Text>
            <Text style={styles.infoBodyText}>
              Luxury Watch Authenticator ทำงานผ่านเทคโนโลยีโมเดลสายตาคอมพิวเตอร์ขั้นสูง (Advanced Deep Computer Vision - DINOv3) ร่วมกับสถาปัตยกรรม Visual Retrieval-Augmented Generation (Visual RAG) 
              ระบบจะสกัดชุดพิกัดเวกเตอร์จำนวน 1024 มิติจากภาพถ่ายมุมกล้องหลัก 3-4 มุม (หน้าปัด, ฝาหลัง, เม็ดมะยม และเครื่องนาฬิกาหากมี) แล้วนำเวกเตอร์ดังกล่าวเข้าเปรียบเทียบในลักษณะรูปทรง สัดส่วน ฟอนต์ตัวอักษร และรายละเอียดลายปลีกย่อยกับฐานข้อมูลอ้างอิงของแท้ (Reference Vault) กว่า 13,585 รูปแบบ เพื่อระบุตำแหน่งความสอดคล้อง (Confidence Landmarks) ในเวลาน้อยกว่า 2 วินาที
            </Text>

            <Text style={styles.infoSectionHeader}>2. ผลการวิเคราะห์จากระบบสามารถใช้แทนการรับรองโดยผู้เชี่ยวชาญ/ช่างเทคนิคได้หรือไม่?</Text>
            <Text style={styles.infoBodyText}>
              ไม่ได้ครับ แอปพลิเคชันนี้ทำหน้าที่เป็นเครื่องมือวิเคราะห์เชิงทัศนศาสตร์เพื่อคัดกรองกายภาพภายนอกเบื้องต้น (Visual Pre-Screening Utility) 
              ระบบไม่สามารถตรวจวัดกลไกภายในที่ซับซ้อน หรือความถูกต้องของน้ำหนักโลหะผสมพิเศษ (Special Alloys) หรือนาฬิกาประกอบเทียมระดับสูง (Super Clone) ที่ต้องใช้กระบวนการเปิดฝาหลัง ตรวจวัดสเปกตรัมโลหะ หรือทดสอบความเที่ยงตรงด้วยเครื่องไทม์กราฟเฟอร์ (Timing Machine) การรับรองอย่างเป็นทางการยังคงจำเป็นต้องอาศัยช่างนาฬิกาผู้เชี่ยวชาญหรือศูนย์บริการที่ได้รับอนุญาตของแบรนด์โดยตรง
            </Text>

            <Text style={styles.infoSectionHeader}>3. ปัจจุบันแอปพลิเคชันรองรับนาฬิการุ่นและแบรนด์ใดบ้าง?</Text>
            <Text style={styles.infoBodyText}>
              ฐานข้อมูลครอบคลุม 8 แบรนด์นาฬิกาหรูชั้นนำระดับสากล ได้แก่ Audemars Piguet (Royal Oak, Royal Oak Offshore), Cartier (Santos, Tank), Omega (Speedmaster, Seamaster), Panerai (Luminor, Radiomir, Submersible), Patek Philippe (Nautilus, Aquanaut, Calatrava), Rolex (Submariner, Daytona, GMT-Master II, Datejust, Day-Date), Tudor (Black Bay, Pelagos) และ TAG Heuer (Carrera, Monaco, Aquaracer, Formula 1)
            </Text>

            <Text style={styles.infoSectionHeader}>4. ดัชนีราคากลางประเมินมาจากแหล่งข้อมูลใด?</Text>
            <Text style={styles.infoBodyText}>
              มูลค่าตลาดรองประเมิน (Estimated Market Valuation) แสดงผลทั้งในหน่วยดอลลาร์สหรัฐ (USD) และบาทไทย (฿) โดยถูกเชื่อมโยงร่วมกับดัชนีราคาจากตลาดกลางทั่วโลกแบบเรียลไทม์และประวัติการปิดประมูลสะสม รวมถึงกระดานซื้อขายชั้นนำอย่าง Chrono24 ร่วมกับเทรนด์ความต้องการเฉพาะ of ตลาดในทวีปเอเชียตะวันออกเฉียงใต้
            </Text>
          </View>
        );
      } else {
        return (
          <View style={styles.infoContentContainer}>
            <Text style={styles.infoSectionHeader}>1. How does the AI visual verification model work?</Text>
            <Text style={styles.infoBodyText}>
              Luxury Watch Authenticator utilizes advanced DINOv3 deep computer vision pipelines and visual Retrieval-Augmented Generation (RAG) models. It extracts a 1024-dimensional feature embedding from high-fidelity multi-angle macro photos (dial face, bezel alignment, typography, micro-hallmarks, caliber, and caseback finishes). These embeddings are queried against a reference database of 13,585 registered luxury watch variations in less than 2 seconds to calculate optical similarity confidence.
            </Text>

            <Text style={styles.infoSectionHeader}>2. Does this app replace a physical watchmaker inspection?</Text>
            <Text style={styles.infoBodyText}>
              Absolutely not. This application is an independent visual pre-screening tool. It cannot detect internal caliber component deviations, weight discrepancies of internal alloys, or high-grade clones that require physical caseback opening, movement disassembly, and metallurgical or timing machine diagnostics by an authorized watchmaker or official brand service boutique.
            </Text>

            <Text style={styles.infoSectionHeader}>3. Which watch brands and collections are supported?</Text>
            <Text style={styles.infoBodyText}>
              We currently support 8 major luxury brands: Audemars Piguet (Royal Oak, Royal Oak Offshore), Cartier (Santos, Tank), Omega (Speedmaster, Seamaster), Panerai (Luminor, Radiomir, Submersible), Patek Philippe (Nautilus, Aquanaut, Calatrava), Rolex (Submariner, Daytona, GMT-Master II, Datejust, Day-Date), Tudor (Black Bay, Pelagos), and TAG Heuer (Carrera, Monaco, Aquaracer, Formula 1).
            </Text>

            <Text style={styles.infoSectionHeader}>4. How does the dynamic market valuation index work?</Text>
            <Text style={styles.infoBodyText}>
              The estimated market price (USD/THB) is synchronized with global secondary market indexes, including live Chrono24 listings, regional sales trends, and historical collector auctions. Price estimates are updated in real-time or cached depending on your membership tier.
            </Text>
          </View>
        );
      }
    } else if (kind === 'terms') {
      if (lang === 'th') {
        return (
          <View style={styles.infoContentContainer}>
            <Text style={styles.infoSectionHeader}>1. ขอบเขตการให้บริการและการปฏิเสธแบรนด์</Text>
            <Text style={styles.infoBodyText}>
              Luxury Watch Authenticator เป็นแอปพลิเคชันเพื่อการอ้างอิงและประเมินทางทัศนศาสตร์ที่เป็นอิสระอย่างสิ้นเชิง เราไม่มีความเกี่ยวข้องอย่างเป็นทางการ การได้รับสิทธิ์ การเป็นพันธมิตร หรือการได้รับการสนับสนุนจากแบรนด์ Rolex, Patek Philippe, Audemars Piguet, TAG Heuer, Cartier หรือผู้ผลิตรายใดๆ ทั้งสิ้น เครื่องหมายการค้า ชื่อรุ่น โลโก้ และลิขสิทธิ์ทั้งหมดเป็นสิทธิ์ขาดของเจ้าของแบรนด์นั้นๆ แต่เพียงผู้เดียว
            </Text>

            <Text style={styles.infoSectionHeader}>2. ข้อจำกัดความรับผิดชอบเชิงกฎหมาย (Disclaimer of Liability)</Text>
            <Text style={styles.infoBodyText}>
              เปอร์เซ็นต์ความสอดคล้องความแท้ แผนที่ความร้อนบอกตำแหน่งจุดสังเกต และดัชนีราคาตลาดรอง จัดทำขึ้นเพื่อจุดประสงค์ในการให้ข้อมูลแนะนำ การศึกษา และการคัดกรองเบื้องต้นในการตัดสินใจสะสมเท่านั้น แอปพลิเคชันไม่ได้ทำหน้าที่เป็นผู้ออกใบรับรองสิทธิ์ความถูกต้องทางกฎหมายเพื่อใช้ค้ำประกัน การซื้อขายเชิงพาณิชย์ หรือการประเมินเพื่อทำประกันภัย ผู้ใช้งานยินยอมยอมรับความเสี่ยงทั้งหมดในการทำธุรกรรมซื้อขายนาฬิกาด้วยตนเอง ทางผู้พัฒนาแอปพลิเคชันจะไม่รับผิดชอบต่อความสูญเสียทางการเงิน ข้อพิพาท หรือความเสียหายใดๆ ทั้งทางตรงและทางอ้อม
            </Text>

            <Text style={styles.infoSectionHeader}>3. นโยบายการใช้บริการที่เป็นธรรม (Fair Use Policy)</Text>
            <Text style={styles.infoBodyText}>
              โควตาจำนวนการสแกนการตรวจวิเคราะห์ของสมาชิกรายเดือนและสมาชิกทดลองใช้ ถูกควบคุมเพื่อป้องกันการใช้งานเครื่องเกินขีดจำกัด การดึงข้อมูลอัตโนมัติ (Scraping), การใช้โปรแกรมบอทสแกน (Bots), การดัดแปลงวิศวกรรมย้อนกลับโครงสร้าง API (Reverse Engineering) หรือการนำบัญชีระบบไปปล่อยเช่าเชิงพาณิชย์โดยไม่ได้รับอนุญาต จะส่งผลให้บัญชีผู้ใช้งานถูกยกเลิกการให้บริการทันทีโดยถาวรและไม่มีการคืนเงินทุกกรณี
            </Text>
          </View>
        );
      } else {
        return (
          <View style={styles.infoContentContainer}>
            <Text style={styles.infoSectionHeader}>1. Scope of Independent Horological Assessment</Text>
            <Text style={styles.infoBodyText}>
              Luxury Watch Authenticator is an entirely independent consumer utility and horological screening resource. We hold NO official affiliation, license, sponsorship, authorization, or commercial representation with Rolex SA, Patek Philippe SA, Audemars Piguet, TAG Heuer, Cartier, or any other manufacturer mentioned. All brand names, model indices, logos, and registered trademarks remain the exclusive property of their respective legal owners.
            </Text>

            <Text style={styles.infoSectionHeader}>2. Legally Binding Disclaimer of Warranties</Text>
            <Text style={styles.infoBodyText}>
              All similarity scoring, vector heatmaps, hallmarks checklists, and secondary market valuations generated by this app are provided strictly on an "as-is" basis for recreational, educational, and collector screening guidance only. We do not provide legally binding certificates of authenticity or commercial insurance guarantees. The user accepts 100% full liability and financial risk for any transaction, purchase, or sale decisions made. The developers shall not be liable for any transaction fraud, financial loss, or punitive damages.
            </Text>

            <Text style={styles.infoSectionHeader}>3. Dynamic API Security & Fair Use</Text>
            <Text style={styles.infoBodyText}>
              Monthly subscription quotas and trial limits are reset based on your billing cycle. Any unauthorized scraping, programmatic automated request injections (bots), API reverse-engineering, commercial account sharing, or unauthorized proxy connections will result in immediate and permanent account suspension without prior warning or refund eligibility.
            </Text>
          </View>
        );
      }
    } else {
      if (lang === 'th') {
        return (
          <View style={styles.infoContentContainer}>
            <Text style={styles.infoSectionHeader}>1. การเก็บรวบรวมและย่อข้อมูลความปลอดภัยภาพถ่าย</Text>
            <Text style={styles.infoBodyText}>
              เรารักษาข้อมูลความเป็นส่วนตัวสูงสุดของผู้ใช้งานทุกราย ภาพถ่ายนาฬิกาและรูปใบเซอร์ที่คุณอัปโหลดเข้าสู่กระบวนการ AI Scan จะถูกนำมาประมวลผลผ่านหน่วยความจำอย่างปลอดภัยเพื่อเปลี่ยนเป็นชุดพิกัดเวกเตอร์และแผนที่ความร้อนวิเคราะห์ตำแหน่งความแท้เท่านั้น ภาพต้นฉบับจะถูกเก็บในตู้นิรภัยส่วนตัวบนเครื่องของคุณเอง (Local Database)
            </Text>

            <Text style={styles.infoSectionHeader}>2. การไม่แบ่งปันข้อมูลให้กับบุคคลภายนอก (Strict Non-Disclosure)</Text>
            <Text style={styles.infoBodyText}>
              เราให้การรับประกันสูงสุดว่า รูปถ่าย ประวัติการสแกน รายการสะสมพอร์ตโฟลิโอ บันทึกการซื้อขายส่วนตัว และมูลค่าทรัพย์สินรวมในคอลเลกชันของคุณ จะไม่ถูกนำไปเผยแพร่ แบ่งปัน หรือขายให้กับบริษัทประกันภัยภายนอก แพลตฟอร์มซื้อขายสินค้ามือสอง แบรนด์นาฬิกาผู้ผลิต หรือเครือข่ายกลุ่มยิงโฆษณาใดๆ ทั้งสิ้น ข้อมูลของคุณจะเป็นความลับส่วนบุคคลที่เป็นอิสระของคุณอย่างแท้จริง
            </Text>

            <Text style={styles.infoSectionHeader}>3. สิทธิ์การลบและมาตรฐานความปลอดภัย (GDPR & PDPA Compliance)</Text>
            <Text style={styles.infoBodyText}>
              ข้อมูลและการเชื่อมโยงเซสชันทั้งหมดเข้ารหัสด้วยเทคโนโลยี SSL/TLS ระดับพรีเมียม เมื่อใดก็ตามที่คุณเข้าหน้าประวัติและการตั้งค่าแล้วเลือกคำสั่ง "ล้างประวัติข้อมูลตู้นิรภัยและสแกนทั้งหมด" ระบบจะทำการเคลียร์ข้อมูลในฐานข้อมูลพื้นที่เครื่องและลบบันทึก Telemetry ในเซิร์ฟเวอร์ย่อยทันทีอย่างถาวรตามสิทธิ์ในการถูกลืม (Right to be Forgotten) 
            </Text>
          </View>
        );
      } else {
        return (
          <View style={styles.infoContentContainer}>
            <Text style={styles.infoSectionHeader}>1. Secure Visual Telemetry Processing</Text>
            <Text style={styles.infoBodyText}>
              Your horological privacy is our highest priority. Timepiece photography and certificate images uploaded for AI visual inspection are processed dynamically inside secure sandboxed memory to extract visual embeddings and diagnostic metadata. Original photos remain strictly on your local device vault unless backed up manually.
            </Text>

            <Text style={styles.infoSectionHeader}>2. Absolute Non-Disclosure Agreement</Text>
            <Text style={styles.infoBodyText}>
              We guarantee 100% that your captured watch models, reference catalog, custom price settings, purchase history logbooks, and total estimated portfolio worth are kept strictly confidential. We DO NOT share, license, or sell user telemetry, photos, or transaction records to third-party underwriters, secondary market networks, auction agencies, watch brands, or tracking networks.
            </Text>

            <Text style={styles.infoSectionHeader}>3. Data Erasure Rights (PDPA, GDPR & Swiss Digital Law)</Text>
            <Text style={styles.infoBodyText}>
              All data transmissions are fully protected by military-grade SSL/TLS encryption. Under global digital privacy laws (including PDPA and GDPR), you hold the absolute "Right to be Forgotten." Tapping "Wipe Vault Records & History" instantly and permanently purges your local storage registers, active profiles, and reference caches, leaving no recoverable traces.
            </Text>
          </View>
        );
      }
    }
  };

  return (
    <SafeAreaView style={styles.stubContainer}>
      <Text style={styles.stubTitle}>
        {kind === 'faq' ? (lang === 'th' ? 'คำถามที่พบบ่อย' : 'Frequently Asked Questions') : kind === 'terms' ? (lang === 'th' ? 'ข้อกำหนดการใช้งาน' : 'Terms of Service') : (lang === 'th' ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy')}
      </Text>
      <ScrollView style={{ flex: 1, marginVertical: spacing.md }} showsVerticalScrollIndicator={false}>
        {renderContent()}

        {/* Trademark disclaimer — required by App Store guideline 5.2.4 when */}
        {/* using third-party brand names descriptively in marketing/UI surfaces. */}
        {(kind === 'privacy' || kind === 'terms') && (
          <View style={[styles.infoContentContainer, { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(236, 200, 122, 0.15)', paddingTop: spacing.md }]}>
            <Text style={[styles.infoSectionHeader, { color: colors.amber }]}>
              {lang === 'th' ? 'ข้อสงวนเครื่องหมายการค้า' : 'Trademark Disclaimer'}
            </Text>
            <Text style={[styles.infoBodyText, { fontSize: 13, color: colors.textMuted }]}>
              {lang === 'th'
                ? 'Luxury Authenticator เป็นเครื่องมือวินิจฉัย AI อิสระ ไม่ได้สังกัด ไม่ได้รับการแต่งตั้ง และไม่มีความสัมพันธ์ทางการค้ากับผู้ผลิตนาฬิกาหรือตัวแทนจำหน่ายอย่างเป็นทางการของแบรนด์ใดๆ เครื่องหมายการค้า โลโก้ และชื่อรุ่นทั้งหมด (รวมถึง Rolex, Patek Philippe, Audemars Piguet, Omega, Cartier, Tudor และอื่นๆ) เป็นทรัพย์สินของเจ้าของที่เกี่ยวข้อง การอ้างอิงในแอปเป็นการใช้เชิงพรรณนาเพื่อระบุรุ่นนาฬิกาเท่านั้น'
                : 'Luxury Authenticator is an independent AI diagnostic tool, not affiliated with, authorized by, or endorsed by any watch manufacturer or authorized dealer. All trademarks, logos, and model names referenced (including but not limited to Rolex, Patek Philippe, Audemars Piguet, Omega, Cartier, Tudor and others) are the property of their respective owners. Brand references in the App are descriptive only — used solely to identify the watches users wish to verify.'}
            </Text>
          </View>
        )}

        {/* External link to authoritative hosted policy */}
        {(kind === 'privacy' || kind === 'terms') && (
          <Pressable
            onPress={() => Linking.openURL(kind === 'privacy' ? PRIVACY_URL : TERMS_URL).catch(() => {})}
            style={{
              marginTop: spacing.md,
              padding: spacing.md,
              backgroundColor: 'rgba(236, 200, 122, 0.08)',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(236, 200, 122, 0.3)',
            }}
          >
            <Text style={{ color: colors.amber, fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
              {lang === 'th'
                ? `📖 อ่านฉบับเต็ม (เปิดในเบราว์เซอร์) →`
                : `📖 Read full version (opens in browser) →`}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
              {kind === 'privacy' ? PRIVACY_URL : TERMS_URL}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      <Pressable style={styles.stubCloseBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.stubCloseBtnText}>{lang === 'th' ? 'ย้อนกลับ' : 'RETURN'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
