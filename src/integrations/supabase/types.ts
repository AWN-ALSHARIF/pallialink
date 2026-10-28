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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          auth_id: string | null
          can_approve_closure: boolean
          name_ar: string
          name_en: string
          patient_id: string | null
          persona_id: string
          role: string
        }
        Insert: {
          auth_id?: string | null
          can_approve_closure?: boolean
          name_ar: string
          name_en: string
          patient_id?: string | null
          persona_id: string
          role: string
        }
        Update: {
          auth_id?: string | null
          can_approve_closure?: boolean
          name_ar?: string
          name_en?: string
          patient_id?: string | null
          persona_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: number
          care_team: string[]
          condition_ar: string
          condition_en: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          age: number
          care_team?: string[]
          condition_ar: string
          condition_en: string
          id: string
          name_ar: string
          name_en: string
        }
        Update: {
          age?: number
          care_team?: string[]
          condition_ar?: string
          condition_en?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      report_activity: {
        Row: {
          assignee_id: string | null
          at: string
          by_user_id: string
          id: number
          note: string | null
          plan: string | null
          report_id: string
          status: string | null
          type: string
        }
        Insert: {
          assignee_id?: string | null
          at?: string
          by_user_id: string
          id?: number
          note?: string | null
          plan?: string | null
          report_id: string
          status?: string | null
          type: string
        }
        Update: {
          assignee_id?: string | null
          at?: string
          by_user_id?: string
          id?: number
          note?: string | null
          plan?: string | null
          report_id?: string
          status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_activity_by_user_id_fkey"
            columns: ["by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "report_activity_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          assignee_id: string | null
          created_at: string
          id: string
          notes: string
          pain: number
          patient_id: string
          status: string
          submitted_by: string
          symptoms: string[]
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          id: string
          notes?: string
          pain: number
          patient_id: string
          status?: string
          submitted_by: string
          symptoms?: string[]
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          id?: string
          notes?: string
          pain?: number
          patient_id?: string
          status?: string
          submitted_by?: string
          symptoms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "reports_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _mk: {
        Args: {
          assignee: string
          by_u: string
          h: number
          n: number
          notes: string
          p: string
          pain: number
          st: string
          sy: string[]
        }
        Returns: undefined
      }
      can_view_patient: { Args: { p: string }; Returns: boolean }
      current_persona: {
        Args: never
        Returns: {
          auth_id: string | null
          can_approve_closure: boolean
          name_ar: string
          name_en: string
          patient_id: string | null
          persona_id: string
          role: string
        }
        SetofOptions: {
          from: "*"
          to: "app_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_action: {
        Args: {
          p_action: string
          p_id: string
          p_note?: string
          p_plan?: string
          p_target?: string
        }
        Returns: undefined
      }
      reset_demo: { Args: never; Returns: undefined }
      seed_demo: { Args: never; Returns: undefined }
      submit_report: {
        Args: { p_notes: string; p_pain: number; p_symptoms: string[] }
        Returns: string
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
