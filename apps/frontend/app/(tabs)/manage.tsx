import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { beneficiariesAPI, loansAPI } from '../../utils/api';

type TabKey = 'beneficiary' | 'loan';

interface Beneficiary {
  id: string;
  name: string;
  phone_number: string;
  address: string;
}

// ─── Shared Input ─────────────────────────────────────────────────────────────

interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
  required?: boolean;
}

function InputField({ label, placeholder, value, onChangeText, keyboardType = 'default', multiline, required }: InputFieldProps) {
  return (
    <View style={inputStyles.group}>
      <Text style={inputStyles.label}>
        {label}{required ? <Text style={inputStyles.req}> *</Text> : <Text style={inputStyles.opt}> (optional)</Text>}
      </Text>
      <TextInput
        style={[inputStyles.input, multiline && inputStyles.textarea]}
        placeholder={placeholder}
        placeholderTextColor="#CBD5E1"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const inputStyles = StyleSheet.create({
  group: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 7 },
  req: { color: '#EF4444', fontWeight: '700' },
  opt: { color: '#9CA3AF', fontWeight: '400', fontSize: 12 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#0D1B2A',
  },
  textarea: { height: 84, paddingTop: 13 },
});

// ─── Main Component ───────────────────────────────────────────────────────────

const EMPTY_BENEFICIARY = { name: '', phone_number: '', address: '', aadhaar: '', email: '' };
const EMPTY_LOAN = { beneficiary_id: '', loan_id: '', purpose: '', amount: '', tenure_months: '', interest_rate: '', estimated_item_cost: '' };

export default function Manage() {
  const [activeTab, setActiveTab] = useState<TabKey>('beneficiary');
  const [loading, setLoading] = useState(false);
  const [beneficiaryForm, setBeneficiaryForm] = useState({ ...EMPTY_BENEFICIARY });
  const [loanForm, setLoanForm] = useState({ ...EMPTY_LOAN });
  const [searchPhone, setSearchPhone] = useState('');
  const [searchingBeneficiary, setSearchingBeneficiary] = useState(false);
  const [foundBeneficiary, setFoundBeneficiary] = useState<Beneficiary | null>(null);

  const searchBeneficiary = async () => {
    if (!searchPhone.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }
    setSearchingBeneficiary(true);
    setFoundBeneficiary(null);
    try {
      const response = await beneficiariesAPI.list();
      const beneficiary = response.data.find((b: Beneficiary) => b.phone_number === searchPhone.trim());
      if (beneficiary) {
        setFoundBeneficiary(beneficiary);
        setLoanForm({ ...loanForm, beneficiary_id: beneficiary.id });
      } else {
        Alert.alert('Not Found', 'No beneficiary found with this phone number');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to search beneficiary');
    } finally {
      setSearchingBeneficiary(false);
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const createBeneficiary = async () => {
    const { name, phone_number, address } = beneficiaryForm;
    if (!name.trim() || !phone_number.trim() || !address.trim()) {
      Alert.alert('Missing Fields', 'Name, Phone Number, and Address are required.');
      return;
    }
    setLoading(true);
    try {
      await beneficiariesAPI.create({
        ...beneficiaryForm,
        aadhaar: beneficiaryForm.aadhaar || undefined,
        email: beneficiaryForm.email || undefined,
      });
      Alert.alert('✅ Success', 'Beneficiary created successfully.');
      setBeneficiaryForm({ ...EMPTY_BENEFICIARY });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const createLoan = async () => {
    const { beneficiary_id, loan_id, purpose, amount, tenure_months } = loanForm;
    if (!beneficiary_id.trim() || !loan_id.trim() || !purpose.trim() || !amount || !tenure_months) {
      Alert.alert('Missing Fields', 'All required fields must be filled.');
      return;
    }
    const amountNum = parseFloat(amount);
    const tenureNum = parseInt(tenure_months, 10);
    const interestNum = loanForm.interest_rate ? parseFloat(loanForm.interest_rate) : undefined;
    const itemCostNum = loanForm.estimated_item_cost ? parseFloat(loanForm.estimated_item_cost) : undefined;

    if (isNaN(amountNum) || amountNum <= 0) { Alert.alert('Invalid', 'Enter a valid positive amount.'); return; }
    if (isNaN(tenureNum) || tenureNum <= 0) { Alert.alert('Invalid', 'Enter a valid tenure in months.'); return; }
    if (itemCostNum !== undefined && (isNaN(itemCostNum) || itemCostNum <= 0)) {
      Alert.alert('Invalid', 'Enter a valid positive estimated item cost.');
      return;
    }

    setLoading(true);
    try {
      await loansAPI.create({
        beneficiary_id, loan_id, purpose,
        amount: amountNum, tenure_months: tenureNum,
        interest_rate: interestNum,
        estimated_item_cost: itemCostNum,
      });
      Alert.alert('✅ Success', 'Loan created successfully.');
      setLoanForm({ ...EMPTY_LOAN });
      setFoundBeneficiary(null);
      setSearchPhone('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Tab Toggle ──────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {(['beneficiary', 'loan'] as TabKey[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && styles.activeTab]}
            onPress={() => setActiveTab(t)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={t === 'beneficiary' ? 'person-add' : 'document-text'}
              size={18}
              color={activeTab === t ? '#0052A5' : '#9CA3AF'}
              style={{ marginRight: 7 }}
            />
            <Text style={[styles.tabText, activeTab === t && styles.activeTabText]}>
              {t === 'beneficiary' ? 'New Beneficiary' : 'New Loan'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'beneficiary' ? (
          <View style={styles.formCard}>
            <View style={styles.formHeaderRow}>
              <View style={styles.formIconBg}>
                <Ionicons name="person-add" size={24} color="#0052A5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Create Beneficiary</Text>
                <Text style={styles.formDesc}>Register a new loan beneficiary in the system.</Text>
              </View>
            </View>

            <InputField label="Full Name"     placeholder="E.g. Priya Sharma"              value={beneficiaryForm.name}         onChangeText={(t) => setBeneficiaryForm({ ...beneficiaryForm, name: t })}         required />
            <InputField label="Phone Number"  placeholder="+91XXXXXXXXXX"                   value={beneficiaryForm.phone_number} onChangeText={(t) => setBeneficiaryForm({ ...beneficiaryForm, phone_number: t })} required keyboardType="phone-pad" />
            <InputField label="Address"       placeholder="Village / District / State"      value={beneficiaryForm.address}      onChangeText={(t) => setBeneficiaryForm({ ...beneficiaryForm, address: t })}      required multiline />
            <InputField label="Aadhaar No."   placeholder="12-digit Aadhaar number"         value={beneficiaryForm.aadhaar}      onChangeText={(t) => setBeneficiaryForm({ ...beneficiaryForm, aadhaar: t })}      keyboardType="number-pad" />
            <InputField label="Email Address" placeholder="email@example.com"               value={beneficiaryForm.email}        onChangeText={(t) => setBeneficiaryForm({ ...beneficiaryForm, email: t })}        keyboardType="email-address" />

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitDisabled]}
              onPress={createBeneficiary}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Create Beneficiary</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formCard}>
            <View style={styles.formHeaderRow}>
              <View style={[styles.formIconBg, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="document-text" size={24} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Create Loan</Text>
                <Text style={styles.formDesc}>Assign a new loan to an existing beneficiary.</Text>
              </View>
            </View>

            {/* Search Beneficiary by Phone */}
            <View style={inputStyles.group}>
              <Text style={inputStyles.label}>
                Beneficiary Phone Number<Text style={inputStyles.req}> *</Text>
              </Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="+91XXXXXXXXXX"
                  placeholderTextColor="#CBD5E1"
                  value={searchPhone}
                  onChangeText={setSearchPhone}
                  keyboardType="phone-pad"
                />
                <TouchableOpacity
                  style={styles.searchBtn}
                  onPress={searchBeneficiary}
                  disabled={searchingBeneficiary}
                  activeOpacity={0.7}
                >
                  {searchingBeneficiary ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="search" size={20} color="#FFF" />
                  )}
                </TouchableOpacity>
              </View>

              {foundBeneficiary ? (
                <View style={styles.foundBeneficiary}>
                  <View style={styles.foundBeneficiaryLeft}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{foundBeneficiary.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.beneficiaryInfo}>
                      <Text style={styles.beneficiaryName}>{foundBeneficiary.name}</Text>
                      <Text style={styles.beneficiaryPhone}>{foundBeneficiary.phone_number}</Text>
                    </View>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                </View>
              ) : null}
            </View>

            <InputField label="Loan ID" placeholder="E.g. LOAN-2025-001" value={loanForm.loan_id} onChangeText={(t) => setLoanForm({ ...loanForm, loan_id: t })} required />
            <InputField label="Purpose" placeholder="E.g. Irrigation equipment purchase" value={loanForm.purpose} onChangeText={(t) => setLoanForm({ ...loanForm, purpose: t })} required multiline />
            <InputField label="Amount (₹)" placeholder="E.g. 50000" value={loanForm.amount} onChangeText={(t) => setLoanForm({ ...loanForm, amount: t })} required keyboardType="decimal-pad" />
            <InputField label="Estimated Item Cost (₹)" placeholder="E.g. 45000" value={loanForm.estimated_item_cost} onChangeText={(t) => setLoanForm({ ...loanForm, estimated_item_cost: t })} keyboardType="decimal-pad" />
            <InputField label="Tenure (months)" placeholder="E.g. 24" value={loanForm.tenure_months} onChangeText={(t) => setLoanForm({ ...loanForm, tenure_months: t })} required keyboardType="number-pad" />
            <InputField label="Interest Rate %" placeholder="E.g. 8.5" value={loanForm.interest_rate} onChangeText={(t) => setLoanForm({ ...loanForm, interest_rate: t })} keyboardType="decimal-pad" />

            <TouchableOpacity
              style={[styles.submitBtn, styles.submitLoan, loading && styles.submitDisabled]}
              onPress={createLoan}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="add-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Create Loan</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4F8' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16 },
  activeTab: { borderBottomWidth: 3, borderBottomColor: '#0052A5' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  activeTabText: { color: '#0052A5' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  formCard: {
    backgroundColor: '#FFF', borderRadius: 22, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 5,
  },
  formHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  formIconBg: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#0D1B2A', marginBottom: 3 },
  formDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17 },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 16,
  },
  infoBoxText: { fontSize: 13, color: '#1D4ED8', flex: 1, lineHeight: 18 },

  // Search Beneficiary Styles
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0D1B2A',
  },
  searchBtn: {
    width: 50,
    height: 50,
    backgroundColor: '#0052A5',
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  foundBeneficiary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#10B981',
    marginTop: 8,
  },
  foundBeneficiaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0052A5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  beneficiaryInfo: {
    flex: 1,
  },
  beneficiaryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0D1B2A',
    marginBottom: 2,
  },
  beneficiaryPhone: {
    fontSize: 13,
    color: '#6B7280',
  },

  submitBtn: {
    backgroundColor: '#0052A5', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8,
    shadowColor: '#0052A5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 10, elevation: 6,
  },
  submitLoan: { backgroundColor: '#F59E0B', shadowColor: '#F59E0B' },
  submitDisabled: { opacity: 0.55 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
