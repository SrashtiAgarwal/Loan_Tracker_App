import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, Image, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { mediaAPI, approvalsAPI } from '../../utils/api';

const { width } = Dimensions.get('window');

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  media_type: string;
  description?: string;
  cloudinary_url?: string;
  ai_verification_status: string;
  upload_timestamp: string;
  gps_coordinates: { latitude: number; longitude: number };
  beneficiary_id: string;
  loan_id: string;
  original_filename?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const AI_STATUS_STYLE: Record<string, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:    { bg: '#FEF3C7', text: '#92400E', icon: 'time' },
  verified:   { bg: '#D1FAE5', text: '#065F46', icon: 'checkmark-circle' },
  suspicious: { bg: '#FEE2E2', text: '#991B1B', icon: 'warning' },
  failed:     { bg: '#F3F4F6', text: '#374151', icon: 'close-circle' },
};

const DOC_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  photo:       'camera',
  receipt:     'receipt',
  form:        'document-text',
  id_document: 'id-card',
  video:       'videocam',
  other:       'folder',
};

function formatDate(ts: string) {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function Review() {
  const { user } = useAuth();
  const isOfficer = user?.role === 'officer' || user?.role === 'admin';

  const [pendingMedia, setPendingMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [comments, setComments] = useState('');
  const [approving, setApproving] = useState(false);

  const loadPendingMedia = useCallback(async () => {
    try {
      const res = await mediaAPI.getPendingReview();
      setPendingMedia(res.data);
    } catch (e: any) {
      console.error('Review load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOfficer) loadPendingMedia();
    else setLoading(false);
  }, [isOfficer]);

  const onRefresh = () => { setRefreshing(true); loadPendingMedia(); };

  const submitApproval = async (status: 'approved' | 'rejected' | 'reupload_requested') => {
    if (!selectedMedia) return;
    setApproving(true);
    try {
      await approvalsAPI.create({ media_id: selectedMedia.id, status, comments });
      Alert.alert('Done', `Decision: ${status.replace('_', ' ')}`);
      setSelectedMedia(null);
      setComments('');
      loadPendingMedia();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit decision');
    } finally {
      setApproving(false);
    }
  };

  // ─── Not an officer ───────────────────────────────────────────────────────
  if (!isOfficer) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed" size={64} color="#CBD5E1" />
        <Text style={styles.accessTitle}>Officer Access Only</Text>
        <Text style={styles.accessSub}>This section is restricted to loan officers.</Text>
      </View>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0052A5" />
        <Text style={styles.loadingText}>Loading pending reviews…</Text>
      </View>
    );
  }

  // ─── Card ────────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: MediaItem }) => {
    const ai = AI_STATUS_STYLE[item.ai_verification_status] || AI_STATUS_STYLE.pending;
    const docIcon = DOC_ICON[item.media_type] || 'document';
    return (
      <TouchableOpacity style={styles.card} onPress={() => { setSelectedMedia(item); setComments(''); }}>
        {/* Thumbnail */}
        <View style={styles.cardRow}>
          <View style={styles.thumbWrap}>
            {item.cloudinary_url ? (
              <Image source={{ uri: item.cloudinary_url }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name={docIcon} size={28} color="#9CA3AF" />
              </View>
            )}
          </View>

          <View style={styles.cardInfo}>
            {/* Type + AI badge */}
            <View style={styles.cardTopRow}>
              <View style={styles.typePill}>
                <Ionicons name={docIcon} size={12} color="#0052A5" />
                <Text style={styles.typeText}>{item.media_type.replace('_', ' ').toUpperCase()}</Text>
              </View>
              <View style={[styles.aiBadge, { backgroundColor: ai.bg }]}>
                <Ionicons name={ai.icon} size={12} color={ai.text} />
                <Text style={[styles.aiText, { color: ai.text }]}>
                  {item.ai_verification_status.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={styles.cardDesc} numberOfLines={2}>
              {item.description || item.original_filename || 'No description'}
            </Text>
            <Text style={styles.cardTime}>{formatDate(item.upload_timestamp)}</Text>
            <View style={styles.gpsRow}>
              <Ionicons name="location" size={12} color="#9CA3AF" />
              <Text style={styles.gpsText}>
                {item.gps_coordinates.latitude.toFixed(4)}, {item.gps_coordinates.longitude.toFixed(4)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.reviewBtnRow}>
          <Ionicons name="eye" size={16} color="#0052A5" />
          <Text style={styles.reviewBtnText}>Tap to Review</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      {/* Header summary */}
      <View style={styles.summaryBar}>
        <Ionicons name="hourglass" size={16} color="#92400E" />
        <Text style={styles.summaryText}>
          {pendingMedia.length} item{pendingMedia.length !== 1 ? 's' : ''} pending review
        </Text>
      </View>

      {pendingMedia.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-done-circle" size={72} color="#D1FAE5" />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySub}>No media pending your review.</Text>
        </View>
      ) : (
        <FlatList
          data={pendingMedia}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0052A5" />}
        />
      )}

      {/* ── Approval Modal ── */}
      <Modal
        visible={!!selectedMedia}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedMedia(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Review Document</Text>
              <TouchableOpacity onPress={() => setSelectedMedia(null)}>
                <Ionicons name="close" size={26} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {selectedMedia && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Image preview */}
                <View style={styles.previewWrap}>
                  {selectedMedia.cloudinary_url ? (
                    <Image
                      source={{ uri: selectedMedia.cloudinary_url }}
                      style={styles.previewImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.noPreview}>
                      <Ionicons name={DOC_ICON[selectedMedia.media_type] || 'document'} size={56} color="#CBD5E1" />
                      <Text style={styles.noPreviewText}>No preview available</Text>
                    </View>
                  )}
                </View>

                {/* AI Verdict */}
                {(() => {
                  const ai = AI_STATUS_STYLE[selectedMedia.ai_verification_status] || AI_STATUS_STYLE.pending;
                  return (
                    <View style={[styles.aiVerdict, { backgroundColor: ai.bg }]}>
                      <Ionicons name={ai.icon} size={20} color={ai.text} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.aiVerdictTitle, { color: ai.text }]}>
                          AI Verdict: {selectedMedia.ai_verification_status.replace('_', ' ').toUpperCase()}
                        </Text>
                        <Text style={[styles.aiVerdictSub, { color: ai.text }]}>
                          {selectedMedia.ai_verification_status === 'verified'
                            ? 'Document passed automated checks.'
                            : selectedMedia.ai_verification_status === 'suspicious'
                              ? 'Potential issue detected — please review carefully.'
                              : 'AI check is still in progress or failed.'}
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Meta */}
                <View style={styles.metaBox}>
                  <MetaRow label="Type" value={selectedMedia.media_type.replace('_', ' ')} />
                  <MetaRow label="Description" value={selectedMedia.description || selectedMedia.original_filename || '—'} />
                  <MetaRow
                    label="GPS"
                    value={`${selectedMedia.gps_coordinates.latitude.toFixed(5)}, ${selectedMedia.gps_coordinates.longitude.toFixed(5)}`}
                  />
                  <MetaRow label="Uploaded" value={formatDate(selectedMedia.upload_timestamp)} />
                </View>

                {/* Comments */}
                <View style={styles.commentsSection}>
                  <Text style={styles.commentsLabel}>Officer Comments (optional)</Text>
                  <TextInput
                    style={styles.commentsInput}
                    placeholder="Add remarks…"
                    placeholderTextColor="#9CA3AF"
                    value={comments}
                    onChangeText={setComments}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* Action buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={() => submitApproval('approved')}
                    disabled={approving}
                  >
                    {approving
                      ? <ActivityIndicator color="#FFF" size="small" />
                      : <>
                          <Ionicons name="checkmark" size={20} color="#FFF" />
                          <Text style={styles.actionBtnText}>Approve</Text>
                        </>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => submitApproval('rejected')}
                    disabled={approving}
                  >
                    <Ionicons name="close" size={20} color="#FFF" />
                    <Text style={styles.actionBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.reuploadBtn}
                  onPress={() => submitApproval('reupload_requested')}
                  disabled={approving}
                >
                  <Ionicons name="refresh" size={18} color="#0052A5" />
                  <Text style={styles.reuploadText}>Request Re-upload</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Small helper ──────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4F8' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#F0F4F8' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 15 },
  accessTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginTop: 16, marginBottom: 6 },
  accessSub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  summaryBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  summaryText: { fontSize: 13, fontWeight: '600', color: '#92400E' },

  list: { padding: 16 },

  // Card
  card: {
    backgroundColor: '#FFF', borderRadius: 18, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', padding: 14, gap: 12 },
  thumbWrap: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden' },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  typeText: { fontSize: 10, fontWeight: '700', color: '#0052A5' },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto',
  },
  aiText: { fontSize: 10, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: '#374151', marginBottom: 4 },
  cardTime: { fontSize: 11, color: '#9CA3AF', marginBottom: 3 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gpsText: { fontSize: 11, color: '#9CA3AF' },
  reviewBtnRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  reviewBtnText: { fontSize: 13, fontWeight: '600', color: '#0052A5' },

  // Empty
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#9CA3AF' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  modalHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  // Preview
  previewWrap: {
    width: '100%', height: 240, backgroundColor: '#F9FAFB',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  previewImg: { width: '100%', height: '100%' },
  noPreview: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  noPreviewText: { fontSize: 13, color: '#9CA3AF' },

  // AI verdict
  aiVerdict: {
    flexDirection: 'row', alignItems: 'flex-start', margin: 16,
    borderRadius: 14, padding: 14, gap: 4,
  },
  aiVerdictTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  aiVerdictSub: { fontSize: 12, lineHeight: 18 },

  // Meta
  metaBox: {
    marginHorizontal: 16, backgroundColor: '#F9FAFB',
    borderRadius: 14, overflow: 'hidden', marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  metaLabel: { width: 100, fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  metaValue: { flex: 1, fontSize: 13, color: '#1F2937' },

  // Comments
  commentsSection: { marginHorizontal: 16, marginBottom: 16 },
  commentsLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  commentsInput: {
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, padding: 12, fontSize: 14, color: '#1F2937',
    textAlignVertical: 'top', height: 80,
  },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: 14, gap: 8,
  },
  approveBtn: { backgroundColor: '#059669' },
  rejectBtn: { backgroundColor: '#DC2626' },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  reuploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, paddingVertical: 14, borderRadius: 14,
    borderWidth: 2, borderColor: '#0052A5', backgroundColor: '#FFF',
  },
  reuploadText: { fontSize: 14, fontWeight: '600', color: '#0052A5' },
});
