import type { WeatherId } from './config';

export type LocalTrack = { id: string; title: string; weathers: WeatherId[] };
export type StoredTrack = LocalTrack & { file: Blob; addedAt: number };

const databaseName = 'aura-sound-library';
const storeName = 'tracks';
let connection: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;

    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('请关闭其他打开此网页的标签页，再更新本地曲库。'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        connection = undefined;
      };
      resolve(database);
    };
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });

  return connection;
}

export async function readTracks(): Promise<StoredTrack[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tracks = request.result as StoredTrack[];
      resolve(tracks.sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id)));
    };
  });
}

async function writeTracks(change: (store: IDBObjectStore) => void): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    try {
      change(transaction.objectStore(storeName));
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export function storeTracks(tracks: StoredTrack[]): Promise<void> {
  return writeTracks((store) => {
    for (const track of tracks) store.add(track);
  });
}

export function deleteTrack(id: string): Promise<void> {
  return writeTracks((store) => { store.delete(id); });
}

export function setTrackWeather(id: string, weather: WeatherId, assigned: boolean): Promise<void> {
  return writeTracks((store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const track = request.result as StoredTrack | undefined;
      if (!track || track.weathers.includes(weather) === assigned) return;
      const weathers = assigned
        ? [...track.weathers, weather]
        : track.weathers.filter((value) => value !== weather);
      store.put({ ...track, weathers });
    };
  });
}
