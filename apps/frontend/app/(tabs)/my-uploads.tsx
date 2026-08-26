/**
 * My Uploads — Beneficiary view
 * Shows all uploads with beneficiary name, loan ID, AI status, and form metadata.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { mediaAPI } from '../../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  media_type: string;
  description?: string;
  loan_id: string;
  beneficiary_id: string;
  upload_timestamp: string;
  ai_verification_status: string;
  sync_status: string;
  gps_coordinates: { latitude: number; longitude: number };
  cloudinary_url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AI_STATUS: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  color: string; bg: string; label: string;
}> = {
  verified:   { icon: 'checkmark-circle', color: '#059669', bg: '#D1FAE5', label: 'AI Verified'  },
  suspicious: { icon: 'warning',          color: '#D97706', bg: '#FEF3C7', label: 'Suspicious'   },
  pending:    { icon: 'time-outline',     color: '#6B7280', bg: '#F3F4F6', label: 'AI Pending'   },
  failed:     { icon: 'close-circle',     color: '#DC2626', bg: '#FEE2E2', label: 'AI Failed'    },
};

const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  photo:   { icon: 'camera',        color: '#0052A5', label: 'Site Photo' },
  receipt: { icon: 'receipt',       color: '#059669', label: 'Receipt'    },
  form:    { icon: 'document-text', color: '#7C3AED', label: 'Form'       },
  video:   { icon: 'videocam',      color: '#DC2626', label: 'Video'      },
  other:   { icon: 'folder',        color: '#92400E', label: 'Other'      },
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Parse "Utensil: Tractor | Amount: ₹12000" from description */
function parseMeta(desc?: string): { utensil?: string; amount?: string; raw: string } {
  if (!desc) return { raw: '' };
  const u = desc.match(/Utensil:\s*([^|]+)/)?.[1]?.trim();
  const a = desc.match(/Amount:\s*(₹?[\d,]+)/)?.[1]?.trim();
  return { utensil: u, amount: a, raw: desc };
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  item, beneficiaryName, loanLabel, onClose,
}: {
  item: MediaItem;
  beneficiaryName: string;
  loanLabel: string;
  onClose: () => void;
}) {
  const ai = AI_STATUS[item.ai_verification_status] || AI_STATUS.pending;
  const tm = TYPE_META[item.media_type] || TYPE_META.other;
  const meta = parseMeta(item.description);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Upload Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Image */}
            <View style={styles.modalImgWrap}>
              {item.cloudinary_url ? (
                <Image source={{ uri: item.cloudinary_url }} style={styles.modalImg} resizeMode="contain" />
              ) : (
                <View style={[styles.modalImg, styles.modalImgPlaceholder]}>
                  <Ionicons name={tm.icon} size={52} color="#CBD5E1" />
                </View>
              )}
            </View>

            {/* AI Status */}
            <View style={[styles.aiVerdict, { backgroundColor: ai.bg }]}>
              <Ionicons name={ai.icon} size={20} color={ai.color} />
              <Text style={[styles.aiVerdictText, { color: ai.color }]}>{ai.label}</Text>
            </View>

            {/* Metadata */}
            <View style={styles.metaBox}>
              <MetaRow icon="person" label="Beneficiary" value={beneficiaryName || '—'} />
              <MetaRow icon="wallet" label="Loan ID" value={loanLabel || item.loan_id.slice(0, 12)} />
              {meta.utensil && <MetaRow icon="construct" label="Item" value={meta.utensil} />}
              {meta.amount && <MetaRow icon="cash" label="Amount" value={meta.amount} />}
              <MetaRow icon={tm.icon} label="Type" value={tm.label} />
              <MetaRow
                icon="location"
                label="GPS"
                value={`${item.gps_coordinates.latitude.toFixed(5)}, ${item.gps_coordinates.longitude.toFixed(5)}`}
              />
              <MetaRow
                icon="time"
                label="Uploaded"
                value={new Date(item.upload_timestamp).toLocaleString('en-IN')}
              />
            </View>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MetaRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={14} color="#9CA3AF" style={{ width: 18 }} />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function UploadCard({
  item, beneficiaryName, loanLabel, onPress,
}: {
  item: MediaItem;
  beneficiaryName: string;
  loanLabel: string;
  onPress: () => void;
}) {
  const ai = AI_STATUS[item.ai_verification_status] || AI_STATUS.pending;
  const tm = TYPE_META[item.media_type] || TYPE_META.other;
  const meta = parseMeta(item.description);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      {/* Thumbnail */}
      <View style={styles.thumbWrap}>
        {item.cloudinary_url ? (
          <Image source={{ uri: item.cloudinary_url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name={tm.icon} size={28} color="#CBD5E1" />
          </View>
        )}
        {/* Type badge over image */}
        <View style={[styles.typeBadge, { backgroundColor: tm.color }]}>
          <Ionicons name={tm.icon} size={11} color="#FFF" />
          <Text style={styles.typeBadgeText}>{tm.label}</Text>
        </View>
      </View>

      {/* Card body */}
      <View style={styles.cardBody}>
        {/* Top: beneficiary + AI status */}
        <View style={styles.cardTopRow}>
          <View style={styles.benefChip}>
            <Ionicons name="person-circle" size={13} color="#0052A5" />
            <Text style={styles.benefChipText} numberOfLines={1}>{beneficiaryName || '—'}</Text>
          </View>
          <View style={[styles.aiBadge, { backgroundColor: ai.bg }]}>
            <Ionicons name={ai.icon} size={12} color={ai.color} />
            <Text style={[styles.aiBadgeText, { color: ai.color }]}>{ai.label}</Text>
          </View>
        </View>

        {/* Loan ID */}
        <View style={styles.infoRow}>
          <Ionicons name="wallet-outline" size={13} color="#9CA3AF" />
          <Text style={styles.infoText}>
            {loanLabel || item.loan_id.slice(0, 12)}
          </Text>
        </View>

        {/* Utensil / Amount from description */}
        {meta.utensil ? (
          <View style={styles.infoRow}>
            <Ionicons name="construct-outline" size={13} color="#9CA3AF" />
            <Text style={styles.infoText}>{meta.utensil}</Text>
            {meta.amount ? <Text style={styles.amountChip}>{meta.amount}</Text> : null}
          </View>
        ) : null}

        {/* Time + sync dot */}
        <View style={styles.cardFooter}>
          <Text style={styles.timeText}>{timeAgo(item.upload_timestamp)}</Text>
          <View style={styles.syncRow}>
            <View style={[
              styles.syncDot,
              { backgroundColor: item.sync_status === 'synced' ? '#10B981' : '#F59E0B' }
            ]} />
            <Text style={styles.syncText}>{item.sync_status}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MyUploads() {
  const { user } = useAuth();
  const [uploads,    setUploads   ] = useState<MediaItem[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError     ] = useState<string | null>(null);
  const [selected,   setSelected  ] = useState<MediaItem | null>(null);

  // Beneficiary info + loan map
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [loanMap, setLoanMap] = useState<Record<string, string>>({}); // id → loan_id string

  const load = useCallback(async () => {
    setError(null);
    try {
      const [uploadsRes, loansRes] = await Promise.all([
        mediaAPI.list(),
        mediaAPI.getMyLoans(),
      ]);

      setUploads(uploadsRes.data);

      if (loansRes.data.beneficiary) {
        setBeneficiaryName(loansRes.data.beneficiary.name);
        const map: Record<string, string> = {};
        (loansRes.data.loans || []).forEach((l: any) => {
          map[l.id] = `${l.loan_id} — ${l.purpose}`;
        });
        setLoanMap(map);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0052A5" />
        <Text style={styles.loadingText}>Loading uploads…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={64} color="#CBD5E1" />
        <Text style={styles.errorTitle}>Failed to load</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Ionicons name="refresh" size={16} color="#FFF" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={uploads}
        keyExtractor={item => item.id}
        contentContainerStyle={uploads.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0052A5" />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          uploads.length > 0 ? (
            <Text style={styles.headerCount}>
              {uploads.length} upload{uploads.length !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <UploadCard
            item={item}
            beneficiaryName={beneficiaryName}
            loanLabel={loanMap[item.loan_id] || ''}
            onPress={() => setSelected(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={72} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No Uploads Yet</Text>
            <Text style={styles.emptySub}>
              Use the Upload tab to submit photos and receipts.
            </Text>
          </View>
        }
      />

      {selected && (
        <DetailModal
          item={selected}
          beneficiaryName={beneficiaryName}
          loanLabel={loanMap[selected.loan_id] || ''}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4F8' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#F0F4F8' },
  loadingText: { marginTop: 14, fontSize: 15, color: '#6B7280' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 18, marginBottom: 6 },
  errorMsg: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0052A5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  list: { padding: 16, paddingTop: 8 },
  emptyContainer: { flex: 1, padding: 16 },
  headerCount: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 12, marginTop: 4 },

  // Card
  card: {
    backgroundColor: '#FFF', borderRadius: 18, marginBottom: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 4,
  },
  thumbWrap: { position: 'relative', width: '100%', height: 160 },
  thumb: { width: '100%', height: '100%', backgroundColor: '#E2E8F0' },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  typeBadge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },

  cardBody: { padding: 14 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },

  benefChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, maxWidth: '55%',
  },
  benefChipText: { fontSize: 12, fontWeight: '600', color: '#0052A5' },

  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  aiBadgeText: { fontSize: 11, fontWeight: '700' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  infoText: { fontSize: 13, color: '#374151', flex: 1 },
  amountChip: { fontSize: 12, fontWeight: '700', color: '#059669', backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 10, paddingTop: 10 },
  timeText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncText: { fontSize: 11, color: '#9CA3AF' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 18, marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22, maxWidth: 260 },

  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalImgWrap: { width: '100%', height: 220, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalImg: { width: '100%', height: '100%' },
  modalImgPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },

  aiVerdict: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, borderRadius: 14, padding: 14,
  },
  aiVerdictText: { fontSize: 14, fontWeight: '700' },

  metaBox: { marginHorizontal: 16, backgroundColor: '#F9FAFB', borderRadius: 14, overflow: 'hidden' },
  metaRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 8,
  },
  metaLabel: { width: 90, fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  metaValue: { flex: 1, fontSize: 13, color: '#111827' },
});
