export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      briefing_logs: {
        Row: {
          audio_url: string | null
          briefing_text: string
          created_at: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          briefing_text: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          audio_url?: string | null
          briefing_text?: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      briefing_settings: {
        Row: {
          custom_instructions: string
          include_batteries: boolean
          include_calendar: boolean
          include_roca_news: boolean
          include_whoop: boolean
          news_topics: string
          text_to_speech_enabled: boolean
          updated_at: string
          user_id: string
          voice: string
        }
        Insert: {
          custom_instructions?: string
          include_batteries?: boolean
          include_calendar?: boolean
          include_roca_news?: boolean
          include_whoop?: boolean
          news_topics?: string
          text_to_speech_enabled?: boolean
          updated_at?: string
          user_id: string
          voice?: string
        }
        Update: {
          custom_instructions?: string
          include_batteries?: boolean
          include_calendar?: boolean
          include_roca_news?: boolean
          include_whoop?: boolean
          news_topics?: string
          text_to_speech_enabled?: boolean
          updated_at?: string
          user_id?: string
          voice?: string
        }
        Relationships: []
      }
      device_batteries: {
        Row: {
          device_name: string
          id: string
          is_charging: boolean | null
          level: number
          updated_at: string
          user_id: string
        }
        Insert: {
          device_name: string
          id?: string
          is_charging?: boolean | null
          level: number
          updated_at?: string
          user_id: string
        }
        Update: {
          device_name?: string
          id?: string
          is_charging?: boolean | null
          level?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_tokens: {
        Row: {
          access_token: string | null
          expires_at: string | null
          id: string
          metadata: Json
          provider: string
          refresh_token: string | null
          scope: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider: string
          refresh_token?: string | null
          scope?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          ingest_token: string
          timezone: string
          updated_at: string
          wake_time: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          ingest_token?: string
          timezone?: string
          updated_at?: string
          wake_time?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          ingest_token?: string
          timezone?: string
          updated_at?: string
          wake_time?: string
        }
        Relationships: []
      }
      smart_home_webhooks: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          target: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          target?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          target?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
