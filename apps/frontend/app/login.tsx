import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, UserRole } from '../contexts/AuthContext';

type Step = 'phone' | 'otp';

export default function Login() {
  const router = useRouter();
  const { sendOTP, login } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep]           = useState<Step>('phone');
  const [phone, setPhone]         = useState('');
  const [otp, setOtp]             = useState('');
  const [name, setName]           = useState('');
  const [role, setRole]           = useState<UserRole>('beneficiary');
  const [loading, setLoading]     = useState(false);
  const [devOtp, setDevOtp]       = useState<string | null>(null);

  // OTP individual boxes
  const otpInputRef = useRef<TextInput>(null);

  // Shake animation for validation errors
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSendOTP = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      shake();
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      const result = await sendOTP(phone);
      setDevOtp(result.otp || null);
      setStep('otp');
      // Show OTP in dev build
      if (result.otp) {
        Alert.alert(
          '🔐 OTP (Dev Only)',
          `Your OTP is: ${result.otp}\n\nThis alert won't appear in production.`
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      shake();
      Alert.alert('Invalid OTP', 'Please enter the full 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      await login(phone, otp, name.trim() || undefined, role);
      router.replace('/(tabs)/home');
    } catch (err: any) {
      shake();
      Alert.alert('Verification Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('phone');
    setOtp('');
    setDevOtp(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >

      {/* Gradient Header */}
      <View style={[styles.headerBg, { paddingTop: Math.max(insets.top + 16, 40) }]}>
        <View style={styles.headerCircle1} />
        <View style={styles.headerCircle2} />
        <View style={styles.headerInner}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={44} color="#FFF" />
          </View>
          <Text style={styles.appName}>LoanTrack</Text>
          <Text style={styles.appTagline}>Secure · Transparent · Fast</Text>
        </View>
      </View>

      {/* Card */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>

          {step === 'phone' ? (
            <>
              <Text style={styles.cardTitle}>Welcome Back</Text>
              <Text style={styles.cardSubtitle}>
                Enter your registered phone number to receive an OTP.
              </Text>

              {/* Phone Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <View style={styles.inputRow}>
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>🇮🇳  +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="XXXXXXXXXX"
                    placeholderTextColor="#BDBDBD"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={handleSendOTP}
                    autoFocus
                  />
                </View>
              </View>

              {/* Role Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>I am a <Text style={styles.optionalTag}>(select your role)</Text></Text>
                <View style={styles.roleContainer}>
                  {(['beneficiary', 'officer', 'admin'] as UserRole[]).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleButton, role === r && styles.roleButtonActive]}
                      onPress={() => setRole(r)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={r === 'beneficiary' ? 'person' : r === 'officer' ? 'briefcase' : 'shield-checkmark'}
                        size={20}
                        color={role === r ? '#FFF' : '#6B7280'}
                      />
                      <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleSendOTP}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>Send OTP</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Back */}
              <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                <Ionicons name="arrow-back" size={20} color="#0066CC" />
                <Text style={styles.backText}>Change Number</Text>
              </TouchableOpacity>

              <Text style={styles.cardTitle}>Verify OTP</Text>
              <Text style={styles.cardSubtitle}>
                Enter the 6-digit code sent to{'\n'}
                <Text style={styles.phonePill}>+91 {phone}</Text>
              </Text>

              {/* OTP Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>One-Time Password</Text>
                <View style={styles.otpInputContainer}>
                  <Ionicons name="lock-closed" size={20} color="#0066CC" style={styles.otpIcon} />
                  <TextInput
                    ref={otpInputRef}
                    style={styles.otpInput}
                    placeholder="• • • • • •"
                    placeholderTextColor="#BDBDBD"
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    maxLength={6}
                    secureTextEntry={false}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyOTP}
                  />
                  {otp.length === 6 && (
                    <Ionicons name="checkmark-circle" size={20} color="#2ECC71" />
                  )}
                </View>
              </View>

              {/* Name (optional, for new users) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Your Name <Text style={styles.optionalTag}>(optional, for new users)</Text></Text>
                <View style={styles.nameInputContainer}>
                  <Ionicons name="person-outline" size={20} color="#0066CC" style={styles.otpIcon} />
                  <TextInput
                    style={styles.nameInput}
                    placeholder="Enter your full name"
                    placeholderTextColor="#BDBDBD"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleVerifyOTP}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>Verify & Login</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendBtn}
                onPress={handleSendOTP}
                disabled={loading}
              >
                <Text style={styles.resendText}>Didn't receive OTP? <Text style={styles.resendLink}>Resend</Text></Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* Footer */}
        <Text style={styles.legalText}>
          By continuing, you agree to our{' '}
          <Text style={styles.legalLink}>Terms of Service</Text> and{' '}
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },

  // ── Header ──
  headerBg: {
    backgroundColor: '#0052A5',
    // paddingTop is set dynamically via insets
    paddingBottom: 60,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  headerCircle1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -60,
    right: -50,
  },
  headerCircle2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -40,
    left: -30,
  },
  headerInner: {
    alignItems: 'center',
    zIndex: 1,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  appTagline: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 6,
    letterSpacing: 1,
  },

  // ── Scroll ──
  scrollArea: {
    flex: 1,
    marginTop: -24,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // ── Card ──
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0D1B2A',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 28,
  },
  phonePill: {
    fontWeight: '700',
    color: '#0066CC',
  },

  // ── Inputs ──
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  optionalTag: {
    color: '#9CA3AF',
    fontWeight: '400',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
  },
  countryCode: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#EEF2FF',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  phoneInput: {
    flex: 1,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#0D1B2A',
    letterSpacing: 1,
  },
  otpInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
  },
  otpIcon: {
    marginRight: 10,
  },
  otpInput: {
    flex: 1,
    fontSize: 22,
    paddingVertical: 14,
    color: '#0D1B2A',
    letterSpacing: 6,
    fontWeight: '700',
  },
  nameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    color: '#0D1B2A',
  },

  // ── Role Selection ──
  roleContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  roleButtonActive: {
    backgroundColor: '#0052A5',
    borderColor: '#0052A5',
  },
  roleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  roleTextActive: {
    color: '#FFF',
  },

  // ── Buttons ──
  primaryBtn: {
    backgroundColor: '#0052A5',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#0052A5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backText: {
    color: '#0066CC',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  resendBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    color: '#6B7280',
  },
  resendLink: {
    color: '#0066CC',
    fontWeight: '700',
  },

  // ── Footer ──
  legalText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  legalLink: {
    color: '#0066CC',
  },
});
