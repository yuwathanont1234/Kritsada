import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../lib/theme';
import { AuthColor } from '../../lib/authVerdictColor';
import { ScanResult } from '../../lib/types';
import { useLanguage } from '../../lib/localization';
import { usePriceFallback } from './usePriceFallback';
import {
  updateWatchName,
  updateWatchPurchasePrice,
  updateWatchCustomPrice,
  updateWatchNotes,
  markWatchAsSold,
  unmarkWatchAsSold,
} from '../../lib/collection';

interface CollectionActionsProps {
  savedId: string;
  result: ScanResult;
  authColor: AuthColor;
  exchangeRate: number | null;

  customName?: string;
  setCustomName: (val?: string) => void;

  notes?: string;
  setNotes: (val?: string) => void;

  purchasePrice?: number;
  setPurchasePrice: (val?: number) => void;

  customPrice?: number;
  setCustomPrice: (val?: number) => void;

  soldAt?: string;
  setSoldAt: (val?: string) => void;

  soldPrice?: number;
  setSoldPrice: (val?: number) => void;

  t: (key: string, options?: any) => string;
}

export default function CollectionActions({
  savedId,
  result,
  authColor,
  exchangeRate,
  customName,
  setCustomName,
  notes,
  setNotes,
  purchasePrice,
  setPurchasePrice,
  customPrice,
  setCustomPrice,
  soldAt,
  setSoldAt,
  soldPrice,
  setSoldPrice,
  t,
}: CollectionActionsProps) {
  const { lang } = useLanguage();
  const { formatTHB } = usePriceFallback();
  const rate = exchangeRate || 1.0;

  // Modal displays
  const [nameEditVisible, setNameEditVisible] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const [notesEditVisible, setNotesEditVisible] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const [purchasePriceEditVisible, setPurchasePriceEditVisible] = useState(false);
  const [purchasePriceDraft, setPurchasePriceDraft] = useState('');

  const [customPriceEditVisible, setCustomPriceEditVisible] = useState(false);
  const [customPriceDraft, setCustomPriceDraft] = useState('');

  // Mark as sold modal
  const [soldModalVisible, setSoldModalVisible] = useState(false);
  const [soldPriceDraft, setSoldPriceDraft] = useState('');
  const [soldToDraft, setSoldToDraft] = useState('');
  const [soldNotesDraft, setSoldNotesDraft] = useState('');

  const saveCustomName = async () => {
    if (!savedId) return;
    try {
      await updateWatchName(savedId, nameDraft);
      setCustomName(nameDraft.trim() || undefined);
      setNameEditVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to update custom name.');
    }
  };

  const saveNotes = async () => {
    if (!savedId) return;
    try {
      await updateWatchNotes(savedId, notesDraft, purchasePrice);
      setNotes(notesDraft.trim() || undefined);
      setNotesEditVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to update vault records.');
    }
  };

  const savePurchasePrice = async () => {
    if (!savedId) return;
    try {
      const val = parseFloat(purchasePriceDraft.replace(/,/g, ''));
      const parsedVal = isNaN(val) ? undefined : Math.round(val / rate);
      await updateWatchPurchasePrice(savedId, parsedVal);
      setPurchasePrice(parsedVal);
      setPurchasePriceEditVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to update purchase cost.');
    }
  };

  const saveCustomPrice = async () => {
    if (!savedId) return;
    try {
      const val = parseFloat(customPriceDraft.replace(/,/g, ''));
      const parsedVal = isNaN(val) ? undefined : Math.round(val / rate);
      await updateWatchCustomPrice(savedId, parsedVal);
      setCustomPrice(parsedVal);
      setCustomPriceEditVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to update target price.');
    }
  };

  const handleMarkAsSold = async () => {
    if (!savedId) return;
    try {
      const prcThb = parseFloat(soldPriceDraft.replace(/,/g, ''));
      if (isNaN(prcThb) || prcThb < 0) {
        Alert.alert('Warning', 'Please enter a valid sale price.');
        return;
      }
      const prcUsd = Math.round(prcThb / rate);
      await markWatchAsSold(savedId, {
        soldPrice: prcUsd,
        soldTo: soldToDraft,
        soldNotes: soldNotesDraft,
      });
      setSoldPrice(prcUsd);
      setSoldAt(new Date().toISOString());
      setSoldModalVisible(false);
      Alert.alert(
        lang === 'th' ? 'อัปเดตตู้สะสมสำเร็จ' : 'Vault Updated',
        lang === 'th' ? 'บันทึกประวัติการขายในพอร์ตโฟลิโอของคุณสำเร็จเรียบร้อย' : 'Sale successfully logged in portfolio.'
      );
    } catch (e) {
      Alert.alert(
        lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Error',
        lang === 'th' ? 'ไม่สามารถบันทึกรายการขายได้' : 'Failed to log sale transaction.'
      );
    }
  };

  const handleUnmarkSold = async () => {
    if (!savedId) return;
    Alert.alert(
      lang === 'th' ? 'คืนค่าสถานะการขาย' : 'Revert Sale',
      lang === 'th'
        ? 'คุณต้องการเปลี่ยนสถานะนาฬิกากลับเป็นนาฬิกาสะสมที่พร้อมใช้งานในตู้สะสมหลักใช่หรือไม่?'
        : 'Would you like to revert this timepiece\'s status back to Active vault?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: lang === 'th' ? 'ยืนยัน' : 'Confirm',
          onPress: async () => {
            try {
              await unmarkWatchAsSold(savedId);
              setSoldPrice(undefined);
              setSoldAt(undefined);
              Alert.alert(
                lang === 'th' ? 'อัปเดตตู้สะสมสำเร็จ' : 'Vault Updated',
                lang === 'th'
                  ? 'เปลี่ยนสถานะเป็นพร้อมสะสมในพอร์ตโฟลิโอเรียบร้อยแล้ว'
                  : 'Timepiece status reverted to active portfolio.'
              );
            } catch (e) {
              Alert.alert(
                lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Error',
                lang === 'th' ? 'ไม่สามารถอัปเดตสถานะของนาฬิกาได้' : 'Failed to update timepiece status.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          {lang === 'th' ? 'การบันทึกข้อมูลพอร์ตโฟลิโอและตู้นิรภัย' : 'PORTFOLIO & VAULT SETTINGS'}
        </Text>

        {/* Custom Name Section */}
        <Pressable
          style={styles.invRow}
          onPress={() => {
            setNameDraft(customName || result.name || '');
            setNameEditVisible(true);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.invLabel}>{lang === 'th' ? 'ชื่อเฉพาะ (Custom Name)' : 'Custom Watch Name'}</Text>
            <Text style={styles.invValue} numberOfLines={1}>
              {customName || (lang === 'th' ? 'ยังไม่ได้ตั้งชื่อเฉพาะ แตะเพื่อตั้งชื่อ...' : 'No custom name. Tap to customize...')}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textSecondary} />
        </Pressable>

        {/* Custom Notes Section */}
        <Pressable
          style={styles.invRow}
          onPress={() => {
            setNotesDraft(notes || '');
            setNotesEditVisible(true);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.invLabel}>{lang === 'th' ? 'บันทึกประวัติเพิ่มเติม' : 'Custom Vault Notes'}</Text>
            <Text style={styles.invValue} numberOfLines={1}>
              {notes ||
                (lang === 'th'
                  ? 'ยังไม่มีบันทึกเพิ่มเติม แตะที่นี่เพื่อพิมพ์ประวัติ การรับประกัน หรือการเซอร์วิสกลไก...'
                  : 'No custom notes. Tap to log timepiece provenance, papers, or service history...')}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textSecondary} />
        </Pressable>

        {/* Purchase Price Section */}
        {authColor !== 'red' && (
          <Pressable
            style={styles.invRow}
            onPress={() => {
              setPurchasePriceDraft(purchasePrice ? String(Math.round(purchasePrice * rate)) : '');
              setPurchasePriceEditVisible(true);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.invLabel}>{lang === 'th' ? 'ราคานาฬิกาตอนที่ซื้อมา (THB)' : 'Acquisition Cost (THB)'}</Text>
              <Text style={styles.invValue}>
                {purchasePrice
                  ? formatTHB(purchasePrice, exchangeRate)
                  : lang === 'th'
                  ? 'ระบุราคาตอนที่ซื้อเพื่อคำนวณกำไร/ขาดทุนสะสม (P&L)'
                  : 'Log purchase cost to compute portfolio P&L'}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </Pressable>
        )}

        {/* Asking / Sale Custom Price Section */}
        {authColor !== 'red' && (
          <Pressable
            style={styles.invRow}
            onPress={() => {
              setCustomPriceDraft(customPrice ? String(Math.round(customPrice * rate)) : '');
              setCustomPriceEditVisible(true);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.invLabel}>{lang === 'th' ? 'มูลค่าเป้าหมายส่วนบุคคล (THB)' : 'Personal Target Value (THB)'}</Text>
              <Text style={styles.invValue}>
                {customPrice
                  ? formatTHB(customPrice, exchangeRate)
                  : lang === 'th'
                  ? 'ระบุมูลค่าเป้าหมายสำหรับการวิเคราะห์ตู้นิรภัยสะสม'
                  : 'Set target valuation for active watch vault'}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </Pressable>
        )}

        {/* Sold Actions */}
        {soldAt ? (
          <Pressable style={styles.soldBadgeRow} onPress={handleUnmarkSold}>
            <View style={styles.soldBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} style={{ marginRight: 4 }} />
              <Text style={styles.soldBadgeText}>
                {lang === 'th'
                  ? `ขายแล้วราคา ${formatTHB(soldPrice, exchangeRate)}`
                  : `SOLD FOR ${formatTHB(soldPrice, exchangeRate)}`}
              </Text>
            </View>
            <Text style={styles.revertText}>{lang === 'th' ? 'แตะเพื่อเปลี่ยนสถานะกลับ' : 'Tap to revert'}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.sellBtn}
            onPress={() => {
              setSoldPriceDraft(customPrice ? String(Math.round(customPrice * rate)) : '');
              setSoldModalVisible(true);
            }}
          >
            <Feather name="shopping-bag" size={16} color="#1A1410" />
            <Text style={styles.sellBtnText}>{lang === 'th' ? 'บันทึกสถานะนาฬิกาเป็น "ขายแล้ว"' : 'Log Timepiece as Sold'}</Text>
          </Pressable>
        )}
      </View>

      {/* Edit Watch Name Modal */}
      <Modal visible={nameEditVisible} transparent animationType="fade" onRequestClose={() => setNameEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{lang === 'th' ? 'แก้ไขชื่อนาฬิกาสะสม' : 'Edit Custom Name'}</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              style={styles.modalInput}
              placeholder={lang === 'th' ? 'ตั้งชื่อเฉพาะสำหรับนาฬิกาเรือนนี้...' : 'Enter a personalized vault name...'}
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setNameEditVisible(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>{lang === 'th' ? 'ยกเลิก' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={saveCustomName} style={styles.modalBtnConfirm}>
                <Text style={styles.modalBtnConfirmText}>{lang === 'th' ? 'บันทึก' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Notes Modal */}
      <Modal visible={notesEditVisible} transparent animationType="fade" onRequestClose={() => setNotesEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{lang === 'th' ? 'แก้ไขบันทึกเพิ่มเติม' : 'Edit Vault Notes'}</Text>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]}
              multiline
              placeholder={
                lang === 'th'
                  ? 'พิมพ์ประวัติการซื้อ กล่องใบรับประกัน หมายเลขซีเรียล หรือประวัติเซอร์วิสกลไก...'
                  : 'Log historical details, certificate numbers, or service notes...'
              }
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setNotesEditVisible(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>{lang === 'th' ? 'ยกเลิก' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={saveNotes} style={styles.modalBtnConfirm}>
                <Text style={styles.modalBtnConfirmText}>{lang === 'th' ? 'บันทึก' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Purchase Cost Modal */}
      <Modal visible={purchasePriceEditVisible} transparent animationType="fade" onRequestClose={() => setPurchasePriceEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{lang === 'th' ? 'ระบุราคาที่ซื้อมา (THB)' : 'Acquisition Price (THB)'}</Text>
            <TextInput
              value={purchasePriceDraft}
              onChangeText={setPurchasePriceDraft}
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder={lang === 'th' ? 'ราคานาฬิกาตอนซื้อเป็นบาท (เช่น 350000)' : 'Purchase price in THB (e.g. 300000)'}
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setPurchasePriceEditVisible(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>{lang === 'th' ? 'ยกเลิก' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={savePurchasePrice} style={styles.modalBtnConfirm}>
                <Text style={styles.modalBtnConfirmText}>{lang === 'th' ? 'บันทึก' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Custom Valuation Price Modal */}
      <Modal visible={customPriceEditVisible} transparent animationType="fade" onRequestClose={() => setCustomPriceEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{lang === 'th' ? 'ระบุมูลค่าเป้าหมายส่วนบุคคล (THB)' : 'Target Valuation (THB)'}</Text>
            <TextInput
              value={customPriceDraft}
              onChangeText={setCustomPriceDraft}
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder={lang === 'th' ? 'ระบุมูลค่าเป้าหมายเป็นบาท' : 'Valuation price in THB'}
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCustomPriceEditVisible(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>{lang === 'th' ? 'ยกเลิก' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={saveCustomPrice} style={styles.modalBtnConfirm}>
                <Text style={styles.modalBtnConfirmText}>{lang === 'th' ? 'บันทึก' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Mark As Sold Modal */}
      <Modal visible={soldModalVisible} transparent animationType="fade" onRequestClose={() => setSoldModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{lang === 'th' ? 'บันทึกรายการขายนาฬิกา' : 'Log Timepiece Sale'}</Text>

            <Text style={styles.inputTitle}>{lang === 'th' ? 'ราคาที่ตกลงขายจริง (บาท)' : 'Transaction Sale Price (THB)'}</Text>
            <TextInput
              value={soldPriceDraft}
              onChangeText={setSoldPriceDraft}
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder={lang === 'th' ? 'ระบุราคาขายเป็นบาท (เช่น 450000)' : 'Actual sale amount in THB (e.g. 450000)'}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputTitle}>{lang === 'th' ? 'ชื่อผู้ซื้อ / ร้านดีลเลอร์นาฬิกา (ไม่บังคับ)' : 'Buyer / Dealer Name (Optional)'}</Text>
            <TextInput
              value={soldToDraft}
              onChangeText={setSoldToDraft}
              style={styles.modalInput}
              placeholder={lang === 'th' ? 'เช่น เสี่ยบี / ดีลเลอร์ / ตลาดนอก' : 'e.g. David SW / Private collector'}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputTitle}>{lang === 'th' ? 'รายละเอียดเพิ่มเติมในการทำรายการขาย' : 'Additional Sale Details'}</Text>
            <TextInput
              value={soldNotesDraft}
              onChangeText={setSoldNotesDraft}
              style={[styles.modalInput, { height: 60 }]}
              multiline
              placeholder={lang === 'th' ? 'ข้อมูลการเทรด แลกเปลี่ยนเรือนอื่น การชำระเงิน การจัดส่ง...' : 'Trade parameters, cash adjustments, shipping notes...'}
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setSoldModalVisible(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>{lang === 'th' ? 'ยกเลิก' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={handleMarkAsSold} style={styles.modalBtnConfirm}>
                <Text style={styles.modalBtnConfirmText}>{lang === 'th' ? 'บันทึกยอดขาย' : 'Log Sale'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  sectionCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    borderLeftWidth: 3,
    borderColor: colors.amber,
    paddingLeft: spacing.sm,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  invRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  invLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  invValue: {
    fontSize: 12,
    color: colors.text,
    marginTop: 4,
    fontWeight: '500',
  },
  soldBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
    borderColor: 'rgba(46, 204, 113, 0.25)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  soldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soldBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.success,
  },
  revertText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginTop: spacing.md,
  },
  sellBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A1410',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1E1814',
    borderColor: 'rgba(236, 200, 122, 0.25)',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ECC87A',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  inputTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B5AFA5',
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderColor: 'rgba(236, 200, 122, 0.15)',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalBtnCancel: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  modalBtnCancelText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalBtnConfirm: {
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  modalBtnConfirmText: {
    fontSize: 13,
    color: '#1A1410',
    fontWeight: '800',
  },
});
