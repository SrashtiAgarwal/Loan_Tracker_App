/**
 * Upload Screen — Beneficiary
 * Camera-only, multiple photos + loan form (loan, utensil, amount, receipts)
 *
 * FIX: utensil_name is now sent as a dedicated field so the backend
 * can cross-check the image against what the user typed — not just
 * the loan purpose.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Image,
  TextInput, ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, Modal, FlatList, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { mediaAPI } from '../../utils/api';

const { width } = Dimensions.get('window');
const THUMB = (width - 48 - 24) / 4;

interface Loan {
  id: string;
  loan_id: string;
  purpose: string;
  amount: number;
  status: string;
  upload_count: number;
}

export default function Upload() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const cameraRef = useRef<any>(null);

  const [loans, setLoans] = useState<Loan[]>([]);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [showLoanPicker, setShowLoanPicker] = useState(false);

  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [utensilName, setUtensilName] = useState('');
  const [amount, setAmount] = useState('');

  const [sitePhotos, setSitePhotos] = useState<string[]>([]);
  const [receiptPhotos, setReceiptPhotos] = useState<string[]>([]);
  const [captureMode, setCaptureMode] = useState<'site' | 'receipt'>('site');

  const [uploading, setUploading] = useState(false);

  const loadLoans = async () => {
    setLoadingLoans(true);
    try {
      const res = await mediaAPI.getMyLoans();
      if (res.data.beneficiary) {
        setBeneficiaryName(res.data.beneficiary.name);
        setLoans(res.data.loans || []);
      } else {
        Alert.alert('No Profile', res.data.message || 'Contact an officer.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load loans');
    } finally {
      setLoadingLoans(false);
    }
  };

  useEffect(() => {
    loadLoans();
  }, []);

  const openCamera = async (mode: 'site' | 'receipt') => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert('Permission Required', 'Camera access is needed.');
        return;
      }
    }
    setCaptureMode(mode);
    setShowCamera(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (photo.base64) {
        if (captureMode === 'site') {
          setSitePhotos(prev => [...prev, photo.base64!].slice(0, 8));
        } else {
          setReceiptPhotos(prev => [...prev, photo.base64!].slice(0, 8));
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo.');
    }
  };

  const removePhoto = (mode: 'site' | 'receipt', idx: number) => {
    if (mode === 'site') setSitePhotos(prev => prev.filter((_, i) => i !== idx));
    else setReceiptPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const getImageUri = (b64: string) => b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;

  const handleUpload = async () => {
    if (!selectedLoan) return Alert.alert('Select Loan', 'Please choose a loan.');
    if (!utensilName.trim()) return Alert.alert('Required', 'Enter utensil / item name.');
    if (!amount.trim() || isNaN(Number(amount))) return Alert.alert('Required', 'Enter a valid amount.');
    if (sitePhotos.length === 0 && receiptPhotos.length === 0)
      return Alert.alert('No Photos', 'Take at least one photo or receipt photo.');

    setUploading(true);
    try {
      const locPerm = await Location.requestForegroundPermissionsAsync();
      let lat = 0, lon = 0, acc: number | null = null;
      if (locPerm.granted) {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
        acc = loc.coords.accuracy;
      }

      const gps = { latitude: lat, longitude: lon, accuracy: acc };
      const formMeta = `Utensil: ${utensilName} | Amount: ₹${amount}`;

      const allUploads = [
        ...sitePhotos.map(b64 => ({ b64, type: 'photo', desc: formMeta })),
        ...receiptPhotos.map(b64 => ({ b64, type: 'receipt', desc: `Receipt — ${formMeta}` })),
      ];

      let done = 0;
      for (const item of allUploads) {
        await mediaAPI.upload({
          loan_id: selectedLoan.id,
          media_type: item.type,
          description: item.desc,
          media_base64: item.b64,
          gps_coordinates: gps,
          // ─── FIX: send utensil as its own field ───────────────────────
          // The backend now uses this to cross-check the image.
          // e.g. if user types "phone" but uploads a laptop photo → FAILED
          utensil_name: utensilName.trim(),
          // ──────────────────────────────────────────────────────────────
          device_info: {
            device_model: Platform.OS,
            os_version: String(Platform.Version),
            app_version: '1.0.0',
          },
        });
        done++;
      }

      Alert.alert('✅ Uploaded', `${done} file(s) submitted for AI review.`, [{
        text: 'OK', onPress: () => {
          setSitePhotos([]);
          setReceiptPhotos([]);
          setUtensilName('');
          setAmount('');
          setSelectedLoan(null);
        }
      }]);
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── Camera overlay ────────────────────────────────────────────────────────
  if (showCamera) {
    const list = captureMode === 'site' ? sitePhotos : receiptPhotos;
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} facing="back" ref={cameraRef}>
          <View style={camStyles.overlay}>
            <View style={camStyles.topBar}>
              <TouchableOpacity onPress={() => setShowCamera(false)} style={camStyles.closeBtn}>
                <Ionicons name="close" size={28} color="#FFF" />
              </TouchableOpacity>
              <View style={camStyles.modePill}>
                <Ionicons
                  name={captureMode === 'site' ? 'camera' : 'receipt'}
                  size={14} color="#FFF"
                />
                <Text style={camStyles.modeText}>
                  {captureMode === 'site' ? 'Site Photo' : 'Receipt'}
                </Text>
              </View>
              <View style={{ width: 44 }} />
            </View>

            {list.length > 0 && (
              <ScrollView horizontal style={camStyles.strip} showsHorizontalScrollIndicator={false}>
                {list.map((b64, i) => (
                  <Image
                    key={i}
                    source={{ uri: getImageUri(b64) }}
                    style={camStyles.stripThumb}
                  />
                ))}
              </ScrollView>
            )}

            <View style={camStyles.bottomBar}>
              <Text style={camStyles.countText}>{list.length}/8 captured</Text>
              <TouchableOpacity
                style={camStyles.captureBtn}
                onPress={takePicture}
                disabled={list.length >= 8}
              >
                <View style={camStyles.captureInner} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCamera(false)} style={camStyles.doneBtn}>
                <Text style={camStyles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F0F4F8' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <View style={styles.hero}>
          <View style={styles.heroDecor} />
          <Text style={styles.heroTitle}>Loan Upload Form</Text>
          <Text style={styles.heroSub}>Photos & Receipts with GPS + AI verification</Text>
        </View>

        <View style={styles.body}>

          {beneficiaryName ? (
            <View style={styles.benefRow}>
              <Ionicons name="person-circle" size={20} color="#0052A5" />
              <Text style={styles.benefText}>{beneficiaryName}</Text>
            </View>
          ) : null}

          {/* ── LOAN SELECTOR ── */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Loan *</Text>
            <TouchableOpacity onPress={loadLoans} disabled={loadingLoans} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={18} color={loadingLoans ? "#9CA3AF" : "#0052A5"} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() => setShowLoanPicker(true)}
            disabled={loadingLoans}
          >
            {loadingLoans ? (
              <ActivityIndicator size="small" color="#0052A5" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={18} color="#0052A5" />
                <Text style={[styles.selectText, !selectedLoan && styles.placeholder]}>
                  {selectedLoan ? `${selectedLoan.loan_id} — ${selectedLoan.purpose}` : 'Select loan'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </>
            )}
          </TouchableOpacity>

          {/* ── UTENSIL NAME ── */}
          {/*
            ⚠️  This field is now VALIDATED against the uploaded image by AI.
                If the user types "phone" but uploads a laptop photo, it will FAIL.
          */}
          <Text style={styles.label}>Utensil / Item Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tractor, Phone, Laptop, Sewing Machine"
            placeholderTextColor="#9CA3AF"
            value={utensilName}
            onChangeText={setUtensilName}
          />
          <Text style={styles.fieldHint}>
            ⚠️ Make sure photos match this item — AI will verify
          </Text>

          {/* ── AMOUNT ── */}
          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 12000"
            placeholderTextColor="#9CA3AF"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />

          {/* ── SITE PHOTOS ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Site Photos ({sitePhotos.length}/8)</Text>
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={() => openCamera('site')}
              disabled={sitePhotos.length >= 8}
            >
              <Ionicons name="camera" size={16} color="#FFF" />
              <Text style={styles.cameraBtnText}>Open Camera</Text>
            </TouchableOpacity>
          </View>

          {sitePhotos.length > 0 ? (
            <View style={styles.thumbGrid}>
              {sitePhotos.map((b64, i) => (
                <View key={i} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: getImageUri(b64) }}
                    style={styles.thumb}
                  />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removePhoto('site', i)}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <TouchableOpacity style={styles.emptyCapture} onPress={() => openCamera('site')}>
              <Ionicons name="camera-outline" size={36} color="#CBD5E1" />
              <Text style={styles.emptyCaptureText}>Tap to capture site photos</Text>
            </TouchableOpacity>
          )}

          {/* ── RECEIPTS ── */}
          <View style={[styles.sectionHeader, { marginTop: 20 }]}>
            <Text style={styles.label}>Receipts ({receiptPhotos.length}/8)</Text>
            <TouchableOpacity
              style={[styles.cameraBtn, { backgroundColor: '#059669' }]}
              onPress={() => openCamera('receipt')}
              disabled={receiptPhotos.length >= 8}
            >
              <Ionicons name="receipt" size={16} color="#FFF" />
              <Text style={styles.cameraBtnText}>Capture Receipt</Text>
            </TouchableOpacity>
          </View>

          {receiptPhotos.length > 0 ? (
            <View style={styles.thumbGrid}>
              {receiptPhotos.map((b64, i) => (
                <View key={i} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: getImageUri(b64) }}
                    style={styles.thumb}
                  />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removePhoto('receipt', i)}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <TouchableOpacity style={styles.emptyCapture} onPress={() => openCamera('receipt')}>
              <Ionicons name="receipt-outline" size={36} color="#CBD5E1" />
              <Text style={styles.emptyCaptureText}>Tap to capture receipt photos</Text>
            </TouchableOpacity>
          )}

          {/* ── SUBMIT ── */}
          <TouchableOpacity
            style={[styles.submitBtn, uploading && styles.submitDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#FFF" />
                <Text style={styles.submitText}>
                  Submit ({sitePhotos.length + receiptPhotos.length} file
                  {sitePhotos.length + receiptPhotos.length !== 1 ? 's' : ''})
                </Text>
              </>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* ── Loan Picker Modal ── */}
      <Modal
        visible={showLoanPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLoanPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Select Loan</Text>
              <TouchableOpacity onPress={() => setShowLoanPicker(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={loans}
              keyExtractor={l => l.id}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <Text style={{ color: '#9CA3AF' }}>No loans found.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const active = selectedLoan?.id === item.id;
                const statusColor =
                  item.status === 'active' ? '#059669' :
                  item.status === 'approved' ? '#0052A5' : '#D97706';
                return (
                  <TouchableOpacity
                    style={[styles.loanRow, active && styles.loanRowActive]}
                    onPress={() => { setSelectedLoan(item); setShowLoanPicker(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.loanRowTop}>
                        <Text style={styles.loanIdText}>{item.loan_id}</Text>
                        <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
                          <Text style={[styles.statusPillText, { color: statusColor }]}>
                            {item.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.loanPurposeText}>{item.purpose}</Text>
                      <Text style={styles.loanAmountText}>₹{item.amount.toLocaleString('en-IN')}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color="#0052A5" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Camera overlay styles ──────────────────────────────────────────────────────

const camStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 10,
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  modeText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  strip: { paddingHorizontal: 16, paddingVertical: 8 },
  stripThumb: { width: 56, height: 56, borderRadius: 8, marginRight: 6, borderWidth: 2, borderColor: '#FFF' },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingBottom: 48, paddingTop: 16,
  },
  countText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', width: 70 },
  captureBtn: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)',
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#0052A5' },
  doneBtn: { width: 70, alignItems: 'flex-end' },
  doneText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

// ── Form styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#0052A5', paddingTop: 28, paddingBottom: 44,
    paddingHorizontal: 20, overflow: 'hidden', position: 'relative',
  },
  heroDecor: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -30,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },

  body: {
    marginTop: -24, backgroundColor: '#F0F4F8',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48,
  },

  benefRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 20,
  },
  benefText: { fontSize: 15, fontWeight: '600', color: '#0052A5' },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '700', color: '#374151' },
  refreshBtn: {
    padding: 4,
  },

  fieldHint: {
    fontSize: 11, color: '#D97706', marginTop: -10, marginBottom: 16,
    paddingHorizontal: 4,
  },

  input: {
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827',
    marginBottom: 4,
  },

  selectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16,
  },
  selectText: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  placeholder: { color: '#9CA3AF' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  cameraBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0052A5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  cameraBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  thumbWrap: { width: THUMB, height: THUMB, position: 'relative' },
  thumb: { width: '100%', height: '100%', borderRadius: 10 },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#FFF', borderRadius: 12,
  },

  emptyCapture: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed',
    paddingVertical: 28, marginBottom: 4,
  },
  emptyCaptureText: { marginTop: 8, fontSize: 13, color: '#9CA3AF' },

  submitBtn: {
    backgroundColor: '#0052A5', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 28,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '75%', paddingBottom: 32,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  modalTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  loanRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  loanRowActive: { backgroundColor: '#EFF6FF' },
  loanRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  loanIdText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  loanPurposeText: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  loanAmountText: { fontSize: 14, fontWeight: '600', color: '#0052A5' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
});