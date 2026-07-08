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
      biens: {
        Row: {
          adresse: string | null
          bailleur_id: string | null
          created_at: string
          gestionnaire_id: string | null
          id: string
          id_externe: string | null
          notes: string | null
          source: string
          statut: string
          surface: number | null
          titre: string
          type_bien: string | null
          type_operation: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          bailleur_id?: string | null
          created_at?: string
          gestionnaire_id?: string | null
          id?: string
          id_externe?: string | null
          notes?: string | null
          source?: string
          statut?: string
          surface?: number | null
          titre: string
          type_bien?: string | null
          type_operation?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          bailleur_id?: string | null
          created_at?: string
          gestionnaire_id?: string | null
          id?: string
          id_externe?: string | null
          notes?: string | null
          source?: string
          statut?: string
          surface?: number | null
          titre?: string
          type_bien?: string | null
          type_operation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biens_bailleur_id_fkey"
            columns: ["bailleur_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biens_gestionnaire_id_fkey"
            columns: ["gestionnaire_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          bien_id: string
          created_at: string
          date: string
          id: string
          libelle: string
          montant: number
          recurrente: boolean
        }
        Insert: {
          bien_id: string
          created_at?: string
          date: string
          id?: string
          libelle: string
          montant: number
          recurrente?: boolean
        }
        Update: {
          bien_id?: string
          created_at?: string
          date?: string
          id?: string
          libelle?: string
          montant?: number
          recurrente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "charges_bien_id_fkey"
            columns: ["bien_id"]
            isOneToOne: false
            referencedRelation: "biens"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_doublons_ignores: {
        Row: {
          contact_a_id: string
          contact_b_id: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          contact_a_id: string
          contact_b_id: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          contact_a_id?: string
          contact_b_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_doublons_ignores_contact_a_id_fkey"
            columns: ["contact_a_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_doublons_ignores_contact_b_id_fkey"
            columns: ["contact_b_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          archive: boolean
          created_at: string
          email: string | null
          fusionne_avec_id: string | null
          gestionnaire_id: string | null
          id: string
          id_externe: string | null
          interlocuteur: string | null
          nom: string
          notes: string | null
          prenom: string | null
          source: string
          telephone: string | null
          type_contact: string | null
          type_entite: string
          updated_at: string
        }
        Insert: {
          archive?: boolean
          created_at?: string
          email?: string | null
          fusionne_avec_id?: string | null
          gestionnaire_id?: string | null
          id?: string
          id_externe?: string | null
          interlocuteur?: string | null
          nom: string
          notes?: string | null
          prenom?: string | null
          source?: string
          telephone?: string | null
          type_contact?: string | null
          type_entite?: string
          updated_at?: string
        }
        Update: {
          archive?: boolean
          created_at?: string
          email?: string | null
          fusionne_avec_id?: string | null
          gestionnaire_id?: string | null
          id?: string
          id_externe?: string | null
          interlocuteur?: string | null
          nom?: string
          notes?: string | null
          prenom?: string | null
          source?: string
          telephone?: string | null
          type_contact?: string | null
          type_entite?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_fusionne_avec_id_fkey"
            columns: ["fusionne_avec_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_gestionnaire_id_fkey"
            columns: ["gestionnaire_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contrats: {
        Row: {
          created_at: string
          date_debut: string | null
          date_fin: string | null
          depot_garantie: number | null
          id: string
          locataire_id: string | null
          lot_id: string
          loyer_mensuel: number | null
          notes: string | null
          statut: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          depot_garantie?: number | null
          id?: string
          locataire_id?: string | null
          lot_id: string
          loyer_mensuel?: number | null
          notes?: string | null
          statut?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          depot_garantie?: number | null
          id?: string
          locataire_id?: string | null
          lot_id?: string
          loyer_mensuel?: number | null
          notes?: string | null
          statut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrats_locataire_id_fkey"
            columns: ["locataire_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      etats_des_lieux: {
        Row: {
          contrat_id: string
          created_at: string
          date_realisation: string
          id: string
          observations: string | null
          type: string
        }
        Insert: {
          contrat_id: string
          created_at?: string
          date_realisation: string
          id?: string
          observations?: string | null
          type: string
        }
        Update: {
          contrat_id?: string
          created_at?: string
          date_realisation?: string
          id?: string
          observations?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "etats_des_lieux_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
        ]
      }
      impayes: {
        Row: {
          contrat_id: string
          created_at: string
          date_derniere_relance: string | null
          date_echeance: string
          id: string
          montant_du: number
          montant_paye: number
          notes: string | null
          statut: string
        }
        Insert: {
          contrat_id: string
          created_at?: string
          date_derniere_relance?: string | null
          date_echeance: string
          id?: string
          montant_du: number
          montant_paye?: number
          notes?: string | null
          statut?: string
        }
        Update: {
          contrat_id?: string
          created_at?: string
          date_derniere_relance?: string | null
          date_echeance?: string
          id?: string
          montant_du?: number
          montant_paye?: number
          notes?: string | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "impayes_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          id: string
          importe_par: string | null
          nom_fichier: string
          nombre_erreurs: number
          nombre_lignes: number
          nombre_succes: number
          type_import: string
        }
        Insert: {
          created_at?: string
          id?: string
          importe_par?: string | null
          nom_fichier: string
          nombre_erreurs?: number
          nombre_lignes?: number
          nombre_succes?: number
          type_import: string
        }
        Update: {
          created_at?: string
          id?: string
          importe_par?: string | null
          nom_fichier?: string
          nombre_erreurs?: number
          nombre_lignes?: number
          nombre_succes?: number
          type_import?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_importe_par_fkey"
            columns: ["importe_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          bien_id: string
          created_at: string
          id: string
          label: string
          notes: string | null
          statut: string
          surface: number | null
          type_lot: string | null
          updated_at: string
        }
        Insert: {
          bien_id: string
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          statut?: string
          surface?: number | null
          type_lot?: string | null
          updated_at?: string
        }
        Update: {
          bien_id?: string
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          statut?: string
          surface?: number | null
          type_lot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_bien_id_fkey"
            columns: ["bien_id"]
            isOneToOne: false
            referencedRelation: "biens"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      reclamations: {
        Row: {
          bien_id: string
          created_at: string
          description: string | null
          id: string
          locataire_id: string | null
          priorite: string
          statut: string
          titre: string
        }
        Insert: {
          bien_id: string
          created_at?: string
          description?: string | null
          id?: string
          locataire_id?: string | null
          priorite?: string
          statut?: string
          titre: string
        }
        Update: {
          bien_id?: string
          created_at?: string
          description?: string | null
          id?: string
          locataire_id?: string | null
          priorite?: string
          statut?: string
          titre?: string
        }
        Relationships: [
          {
            foreignKeyName: "reclamations_bien_id_fkey"
            columns: ["bien_id"]
            isOneToOne: false
            referencedRelation: "biens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamations_locataire_id_fkey"
            columns: ["locataire_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions_commerciales: {
        Row: {
          bien_id: string | null
          contact_id: string
          created_at: string
          date_visite: string | null
          id: string
          notes: string | null
          statut_opportunite: string
          type_transaction: string
        }
        Insert: {
          bien_id?: string | null
          contact_id: string
          created_at?: string
          date_visite?: string | null
          id?: string
          notes?: string | null
          statut_opportunite?: string
          type_transaction: string
        }
        Update: {
          bien_id?: string | null
          contact_id?: string
          created_at?: string
          date_visite?: string | null
          id?: string
          notes?: string | null
          statut_opportunite?: string
          type_transaction?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_commerciales_bien_id_fkey"
            columns: ["bien_id"]
            isOneToOne: false
            referencedRelation: "biens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_commerciales_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      travaux: {
        Row: {
          bien_id: string
          budget_depense: number
          budget_prevu: number | null
          charge_financiere: string | null
          created_at: string
          date_debut: string | null
          date_fin: string | null
          description: string | null
          etat_des_lieux_id: string | null
          id: string
          notes: string | null
          origine: string | null
          statut: string
          titre: string
        }
        Insert: {
          bien_id: string
          budget_depense?: number
          budget_prevu?: number | null
          charge_financiere?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          description?: string | null
          etat_des_lieux_id?: string | null
          id?: string
          notes?: string | null
          origine?: string | null
          statut?: string
          titre: string
        }
        Update: {
          bien_id?: string
          budget_depense?: number
          budget_prevu?: number | null
          charge_financiere?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          description?: string | null
          etat_des_lieux_id?: string | null
          id?: string
          notes?: string | null
          origine?: string | null
          statut?: string
          titre?: string
        }
        Relationships: [
          {
            foreignKeyName: "travaux_bien_id_fkey"
            columns: ["bien_id"]
            isOneToOne: false
            referencedRelation: "biens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travaux_etat_des_lieux_id_fkey"
            columns: ["etat_des_lieux_id"]
            isOneToOne: false
            referencedRelation: "etats_des_lieux"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
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
