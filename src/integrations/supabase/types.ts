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
      _mig_p1_function_backup: {
        Row: {
          definition: string
          fn_name: string
          saved_at: string
        }
        Insert: {
          definition: string
          fn_name: string
          saved_at?: string
        }
        Update: {
          definition?: string
          fn_name?: string
          saved_at?: string
        }
        Relationships: []
      }
      _mig_p1_report_backup: {
        Row: {
          old_assignee_id: string | null
          old_status: string
          report_id: string
          saved_at: string
        }
        Insert: {
          old_assignee_id?: string | null
          old_status: string
          report_id: string
          saved_at?: string
        }
        Update: {
          old_assignee_id?: string | null
          old_status?: string
          report_id?: string
          saved_at?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          active: boolean
          auth_id: string | null
          can_approve_closure: boolean
          name_ar: string
          name_en: string
          org_id: string
          patient_id: string | null
          persona_id: string
          role: string
        }
        Insert: {
          active?: boolean
          auth_id?: string | null
          can_approve_closure?: boolean
          name_ar: string
          name_en: string
          org_id?: string
          patient_id?: string | null
          persona_id: string
          role: string
        }
        Update: {
          active?: boolean
          auth_id?: string | null
          can_approve_closure?: boolean
          name_ar?: string
          name_en?: string
          org_id?: string
          patient_id?: string | null
          persona_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_entries: {
        Row: {
          created_at: string
          created_by: string
          detail: Json
          id: number
          is_synthetic: boolean
          kind: string
          note: string | null
          patient_id: string
          recorded_at: string
          report_id: string | null
          status: string | null
          supersedes_id: number | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          detail?: Json
          id?: number
          is_synthetic?: boolean
          kind: string
          note?: string | null
          patient_id: string
          recorded_at?: string
          report_id?: string | null
          status?: string | null
          supersedes_id?: number | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          detail?: Json
          id?: number
          is_synthetic?: boolean
          kind?: string
          note?: string | null
          patient_id?: string
          recorded_at?: string
          report_id?: string | null
          status?: string | null
          supersedes_id?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "clinical_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_entries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_entries_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "clinical_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string
          id: number
          patient_id: string
          purpose: string
          responsible_id: string
          status: string
          target_date: string
        }
        Insert: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by: string
          id?: never
          patient_id: string
          purpose: string
          responsible_id: string
          status?: string
          target_date: string
        }
        Update: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string
          id?: never
          patient_id?: string
          purpose?: string
          responsible_id?: string
          status?: string
          target_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: number
          kind: string
          patient_id: string | null
          read_at: string | null
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          patient_id?: string | null
          read_at?: string | null
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          patient_id?: string | null
          read_at?: string | null
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      nursing_task_activity: {
        Row: {
          at: string
          by_user_id: string
          id: number
          note: string | null
          status: string | null
          task_id: string
          type: string
        }
        Insert: {
          at?: string
          by_user_id: string
          id?: never
          note?: string | null
          status?: string | null
          task_id: string
          type: string
        }
        Update: {
          at?: string
          by_user_id?: string
          id?: never
          note?: string | null
          status?: string | null
          task_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursing_task_activity_by_user_id_fkey"
            columns: ["by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "nursing_task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "nursing_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      nursing_tasks: {
        Row: {
          ack_at: string | null
          category: string
          completed_at: string | null
          created_at: string
          due_at: string | null
          findings: string | null
          id: string
          instructions: string
          nurse_id: string
          patient_id: string
          physician_id: string
          priority: string
          review_note: string | null
          reviewed_at: string | null
          started_at: string | null
          status: string
          unable_reason: string | null
        }
        Insert: {
          ack_at?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          findings?: string | null
          id: string
          instructions?: string
          nurse_id: string
          patient_id: string
          physician_id: string
          priority?: string
          review_note?: string | null
          reviewed_at?: string | null
          started_at?: string | null
          status?: string
          unable_reason?: string | null
        }
        Update: {
          ack_at?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          findings?: string | null
          id?: string
          instructions?: string
          nurse_id?: string
          patient_id?: string
          physician_id?: string
          priority?: string
          review_note?: string | null
          reviewed_at?: string | null
          started_at?: string | null
          status?: string
          unable_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nursing_tasks_nurse_id_fkey"
            columns: ["nurse_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "nursing_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursing_tasks_physician_id_fkey"
            columns: ["physician_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      organizations: {
        Row: {
          id: string
          is_demo: boolean
          name_ar: string
          name_en: string
        }
        Insert: {
          id: string
          is_demo?: boolean
          name_ar: string
          name_en: string
        }
        Update: {
          id?: string
          is_demo?: boolean
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      patient_profiles: {
        Row: {
          care_status: string | null
          date_of_birth: string | null
          family_history: string | null
          goals_of_care: string | null
          is_synthetic: boolean
          language: string | null
          mrn: string
          palliative_diagnosis: string | null
          past_medical_history: string | null
          patient_id: string
          patient_preferences: string | null
          primary_diagnosis: string | null
          secondary_diagnoses: string[]
          sex: string | null
          social_history: string | null
          surgical_history: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          care_status?: string | null
          date_of_birth?: string | null
          family_history?: string | null
          goals_of_care?: string | null
          is_synthetic?: boolean
          language?: string | null
          mrn: string
          palliative_diagnosis?: string | null
          past_medical_history?: string | null
          patient_id: string
          patient_preferences?: string | null
          primary_diagnosis?: string | null
          secondary_diagnoses?: string[]
          sex?: string | null
          social_history?: string | null
          surgical_history?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          care_status?: string | null
          date_of_birth?: string | null
          family_history?: string | null
          goals_of_care?: string | null
          is_synthetic?: boolean
          language?: string | null
          mrn?: string
          palliative_diagnosis?: string | null
          past_medical_history?: string | null
          patient_id?: string
          patient_preferences?: string | null
          primary_diagnosis?: string | null
          secondary_diagnoses?: string[]
          sex?: string | null
          social_history?: string | null
          surgical_history?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_profiles_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
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
          org_id: string
        }
        Insert: {
          age: number
          care_team?: string[]
          condition_ar: string
          condition_en: string
          id: string
          name_ar: string
          name_en: string
          org_id?: string
        }
        Update: {
          age?: number
          care_team?: string[]
          condition_ar?: string
          condition_en?: string
          id?: string
          name_ar?: string
          name_en?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      record_access_log: {
        Row: {
          action: string
          at: string
          by_user_id: string
          entry_id: number | null
          id: number
          patient_id: string
          section: string | null
        }
        Insert: {
          action: string
          at?: string
          by_user_id: string
          entry_id?: number | null
          id?: number
          patient_id: string
          section?: string | null
        }
        Update: {
          action?: string
          at?: string
          by_user_id?: string
          entry_id?: number | null
          id?: number
          patient_id?: string
          section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_access_log_by_user_id_fkey"
            columns: ["by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "record_access_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
          audio_duration_s: number | null
          audio_mime: string | null
          audio_path: string | null
          created_at: string
          id: string
          notes: string
          nurse_ack_at: string | null
          nurse_ack_by: string | null
          pain: number
          patient_id: string
          physician_ack_at: string | null
          physician_ack_by: string | null
          return_ack_at: string | null
          return_ack_by: string | null
          return_reason: string | null
          returned_at: string | null
          returned_by: string | null
          status: string
          submitted_by: string
          symptoms: string[]
        }
        Insert: {
          assignee_id?: string | null
          audio_duration_s?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          created_at?: string
          id: string
          notes?: string
          nurse_ack_at?: string | null
          nurse_ack_by?: string | null
          pain: number
          patient_id: string
          physician_ack_at?: string | null
          physician_ack_by?: string | null
          return_ack_at?: string | null
          return_ack_by?: string | null
          return_reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
          status?: string
          submitted_by: string
          symptoms?: string[]
        }
        Update: {
          assignee_id?: string | null
          audio_duration_s?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          created_at?: string
          id?: string
          notes?: string
          nurse_ack_at?: string | null
          nurse_ack_by?: string | null
          pain?: number
          patient_id?: string
          physician_ack_at?: string | null
          physician_ack_by?: string | null
          return_ack_at?: string | null
          return_ack_by?: string | null
          return_reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
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
            foreignKeyName: "reports_nurse_ack_by_fkey"
            columns: ["nurse_ack_by"]
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
            foreignKeyName: "reports_physician_ack_by_fkey"
            columns: ["physician_ack_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "reports_return_ack_by_fkey"
            columns: ["return_ack_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "reports_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["persona_id"]
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
      can_view_report: { Args: { p_report: string }; Returns: boolean }
      create_followup: {
        Args: {
          p_patient: string
          p_purpose: string
          p_responsible: string
          p_target_date: string
        }
        Returns: number
      }
      create_nursing_task: {
        Args: {
          p_category: string
          p_due_at: string
          p_instructions: string
          p_nurse: string
          p_patient: string
          p_priority: string
        }
        Returns: string
      }
      current_persona: {
        Args: never
        Returns: {
          active: boolean
          auth_id: string | null
          can_approve_closure: boolean
          name_ar: string
          name_en: string
          org_id: string
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
      emr_add_entry: {
        Args: {
          p_detail?: Json
          p_kind: string
          p_note?: string
          p_patient: string
          p_recorded_at?: string
          p_report?: string
          p_status?: string
          p_supersedes?: number
          p_title: string
        }
        Returns: number
      }
      emr_log_access: {
        Args: { p_action: string; p_patient: string; p_section?: string }
        Returns: undefined
      }
      emr_update_profile: {
        Args: { p_fields: Json; p_patient: string }
        Returns: undefined
      }
      is_clinician: { Args: never; Returns: boolean }
      list_assignable_nurses: {
        Args: { p_report: string }
        Returns: {
          name_ar: string
          name_en: string
          persona_id: string
        }[]
      }
      list_assignable_physicians: {
        Args: { p_report: string }
        Returns: {
          name_ar: string
          name_en: string
          persona_id: string
        }[]
      }
      list_care_team_nurses: {
        Args: { p_patient: string }
        Returns: {
          name_ar: string
          name_en: string
          persona_id: string
        }[]
      }
      list_notifications: {
        Args: never
        Returns: {
          created_at: string
          id: number
          kind: string
          patient_id: string | null
          read_at: string | null
          ref_id: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_notifications_read: { Args: { p_ids: number[] }; Returns: undefined }
      nursing_task_action: {
        Args: { p_action: string; p_id: string; p_note?: string }
        Returns: undefined
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
        Args: {
          p_audio_duration?: number
          p_audio_mime?: string
          p_audio_path?: string
          p_notes: string
          p_pain: number
          p_symptoms: string[]
        }
        Returns: string
      }
      update_followup: {
        Args: { p_id: number; p_notes?: string; p_status: string }
        Returns: undefined
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
