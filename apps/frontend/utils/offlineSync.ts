import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
const SYNC_QUEUE_KEY = '@sync_queue';

export interface SyncQueueItem {
    id: string;
    endpoint: string;
    method: 'POST' | 'PUT' | 'DELETE';
    data: any;
    timestamp: number;
    retryCount: number;
}

/**
 * Add an action to the offline sync queue
 */
export async function addToSyncQueue(
    endpoint: string,
    method: 'POST' | 'PUT' | 'DELETE',
    data: any
): Promise<void> {
    try {
        const queue = await getSyncQueue();
        const item: SyncQueueItem = {
            id: `${Date.now()}_${Math.random()}`,
            endpoint,
            method,
            data,
            timestamp: Date.now(),
            retryCount: 0,
        };
        queue.push(item);
        await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
        console.log('Added to sync queue:', item);
    } catch (error) {
        console.error('Error adding to sync queue:', error);
    }
}

/**
 * Get the current sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
    try {
        const queueJson = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
        return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
        console.error('Error getting sync queue:', error);
        return [];
    }
}

/**
 * Process the sync queue - upload all pending items
 */
export async function processSyncQueue(): Promise<{
    success: number;
    failed: number;
}> {
    const queue = await getSyncQueue();
    const token = await AsyncStorage.getItem('auth_token');

    if (!token) {
        console.log('No auth token, skipping sync');
        return { success: 0, failed: 0 };
    }

    const headers = { Authorization: `Bearer ${token}` };
    let successCount = 0;
    let failedCount = 0;
    const remainingQueue: SyncQueueItem[] = [];

    for (const item of queue) {
        try {
            console.log(`Syncing: ${item.method} ${item.endpoint}`);

            if (item.method === 'POST') {
                await axios.post(`${API_URL}${item.endpoint}`, item.data, { headers });
            } else if (item.method === 'PUT') {
                await axios.put(`${API_URL}${item.endpoint}`, item.data, { headers });
            } else if (item.method === 'DELETE') {
                await axios.delete(`${API_URL}${item.endpoint}`, { headers });
            }

            successCount++;
            console.log(`✅ Synced: ${item.id}`);
        } catch (error: any) {
            console.error(`❌ Failed to sync ${item.id}:`, error.message);

            // Retry logic: keep in queue if retries < 3
            if (item.retryCount < 3) {
                remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
            } else {
                console.log(`Max retries reached for ${item.id}, removing from queue`);
            }
            failedCount++;
        }
    }

    // Update queue with remaining items
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remainingQueue));

    return { success: successCount, failed: failedCount };
}

/**
 * Check network status and auto-sync if online
 */
export async function setupAutoSync(): Promise<void> {
    NetInfo.addEventListener(state => {
        if (state.isConnected) {
            console.log('Network connected, processing sync queue...');
            processSyncQueue().then(result => {
                console.log(`Sync complete: ${result.success} success, ${result.failed} failed`);
            });
        }
    });
}

/**
 * Clear the sync queue (use with caution)
 */
export async function clearSyncQueue(): Promise<void> {
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify([]));
    console.log('Sync queue cleared');
}

/**
 * Get sync queue status
 */
export async function getSyncStatus(): Promise<{
    pending: number;
    oldestTimestamp: number | null;
}> {
    const queue = await getSyncQueue();
    return {
        pending: queue.length,
        oldestTimestamp: queue.length > 0 ? Math.min(...queue.map(item => item.timestamp)) : null,
    };
}
