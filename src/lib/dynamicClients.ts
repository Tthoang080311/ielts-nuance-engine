import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useAppStore, sanitizeSupabaseBaseUrl } from '@/store/useAppStore';
import { IUserCredentials } from '@/types/database.types';

export type CloudErrorCode =
  | 'MISSING_SUPABASE_URL'
  | 'INVALID_SUPABASE_URL'
  | 'MISSING_SUPABASE_KEY'
  | 'MISSING_GEMINI_KEY';

export class CloudConfigurationError extends Error {
  public readonly code: CloudErrorCode;

  constructor(code: CloudErrorCode, message: string) {
    super(message);
    this.name = 'CloudConfigurationError';
    this.code = code;
    Object.setPrototypeOf(this, CloudConfigurationError.prototype);
  }
}

export class CloudManager {
  private static instance: CloudManager | null = null;
  private supabaseInstance: SupabaseClient | null = null;
  private geminiInstance: GoogleGenerativeAI | null = null;
  private activeSupabaseSignature: string = '';
  private activeGeminiSignature: string = '';

  private constructor() {
    // Private constructor đảm bảo kiến trúc Singleton tuyệt đối
  }

  public static getInstance(): CloudManager {
    if (!CloudManager.instance) {
      CloudManager.instance = new CloudManager();
    }
    return CloudManager.instance;
  }

  private readCredentialsFromStore(): IUserCredentials {
    const state = useAppStore.getState();
    return {
      supabaseUrl: sanitizeSupabaseBaseUrl(state.credentials.supabaseUrl),
      supabaseKey: state.credentials.supabaseKey.trim(),
      geminiKey: state.credentials.geminiKey.trim(),
    };
  }

  public validateSupabaseCredentials(creds?: IUserCredentials): {
    supabaseUrl: string;
    supabaseKey: string;
  } {
    const rawTarget = creds ?? this.readCredentialsFromStore();
    const cleanedUrl = sanitizeSupabaseBaseUrl(rawTarget.supabaseUrl);

    if (!cleanedUrl) {
      throw new CloudConfigurationError(
        'MISSING_SUPABASE_URL',
        'Chưa cấu hình Supabase URL. Vui lòng nhập khóa vào thanh Cloud Sync Bar.'
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanedUrl);
    } catch {
      throw new CloudConfigurationError(
        'INVALID_SUPABASE_URL',
        'Định dạng Supabase URL không hợp lệ (bắt buộc bắt đầu bằng https://).'
      );
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new CloudConfigurationError(
        'INVALID_SUPABASE_URL',
        'Giao thức Supabase URL phải là HTTP hoặc HTTPS.'
      );
    }

    const cleanedKey = rawTarget.supabaseKey.trim();
    if (!cleanedKey || cleanedKey.length < 20) {
      throw new CloudConfigurationError(
        'MISSING_SUPABASE_KEY',
        'Chưa cấu hình Supabase Anon Key hợp lệ. Vui lòng kiểm tra lại trên Cloud Sync Bar.'
      );
    }

    return {
      supabaseUrl: cleanedUrl,
      supabaseKey: cleanedKey,
    };
  }

  public validateGeminiCredentials(creds?: IUserCredentials): string {
    const target = creds ?? this.readCredentialsFromStore();
    const cleanedGemini = target.geminiKey.trim();

    if (!cleanedGemini || cleanedGemini.length < 15) {
      throw new CloudConfigurationError(
        'MISSING_GEMINI_KEY',
        'Chưa cấu hình Google Gemini API Key. Vui lòng nhập khóa trên thanh Cloud Sync Bar.'
      );
    }

    return cleanedGemini;
  }

  public getSupabase(): SupabaseClient {
    const { supabaseUrl, supabaseKey } = this.validateSupabaseCredentials();
    const nextSignature = `${supabaseUrl}::${supabaseKey}`;

    if (!this.supabaseInstance || this.activeSupabaseSignature !== nextSignature) {
      if (this.supabaseInstance) {
        try {
          void this.supabaseInstance.removeAllChannels();
        } catch {
          // Bỏ qua lỗi đóng kênh cũ nếu socket đã ngắt
        }
      }

      this.supabaseInstance = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      this.activeSupabaseSignature = nextSignature;
    }

    return this.supabaseInstance;
  }

  public getGemini(): GoogleGenerativeAI {
    const geminiKey = this.validateGeminiCredentials();

    if (!this.geminiInstance || this.activeGeminiSignature !== geminiKey) {
      this.geminiInstance = new GoogleGenerativeAI(geminiKey);
      this.activeGeminiSignature = geminiKey;
    }

    return this.geminiInstance;
  }

  public hasValidSupabaseConfig(): boolean {
    try {
      this.validateSupabaseCredentials();
      return true;
    } catch {
      return false;
    }
  }

  public hasValidGeminiConfig(): boolean {
    try {
      this.validateGeminiCredentials();
      return true;
    } catch {
      return false;
    }
  }

  public resetClients(): void {
    if (this.supabaseInstance) {
      try {
        void this.supabaseInstance.removeAllChannels();
      } catch {
        // An toàn khi dọn dẹp
      }
    }
    this.supabaseInstance = null;
    this.geminiInstance = null;
    this.activeSupabaseSignature = '';
    this.activeGeminiSignature = '';
  }
}

export const cloudManager = CloudManager.getInstance();