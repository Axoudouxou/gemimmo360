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
      activite_commentaires: {
        Row: {
          activite_id: string
          auteur: string
          contenu: string
          created_at: string
          id: string
        }
        Insert: {
          activite_id: string
          auteur: string
          contenu: string
          created_at?: string
          id?: string
        }
        Update: {
          activite_id?: string
          auteur?: string
          contenu?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activite_commentaires_activite_id_fkey"
            columns: ["activite_id"]
            isOneToOne: false
            referencedRelation: "activites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activite_commentaires_auteur_fkey"
            columns: ["auteur"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activites: {
        Row: {
          assigne_a: string
          bien_id: string | null
          contact_id: string | null
          contrat_id: string | null
          created_at: string
          created_by: string | null
          date_debut: string | null
          date_fin: string | null
          id: string
          lieu: string | null
          lot_id: string | null
          notes: string | null
          priorite: string
          statut: string
          titre: string
          type_activite: string
          updated_at: string
        }
        Insert: {
          assigne_a: string
          bien_id?: string | null
          contact_id?: string | null
          contrat_id?: string | null
          created_at?: string
          created_by?: string | null
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          lieu?: string | null
          lot_id?: string | null
          notes?: string | null
          priorite?: string
          statut?: string
          titre: string
          type_activite?: string
          updated_at?: string
        }
        Update: {
          assigne_a?: string
          bien_id?: string | null
          contact_id?: string | null
          contrat_id?: string | null
          created_at?: string
          created_by?: string | null
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          lieu?: string | null
          lot_id?: string | null
          notes?: string | null
          priorite?: string
          statut?: string
          titre?: string
          type_activite?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activites_assigne_a_fkey"
            columns: ["assigne_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activites_bien_id_fkey"
            columns: ["bien_id"]
            isOneToOne: false
            referencedRelation: "biens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activites_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activites_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activites_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
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
      contrat_modifications_proposees: {
        Row: {
          ancienne_valeur: string | null
          champ_modifie: string
          commentaire: string | null
          contrat_id: string
          created_at: string
          id: string
          nouvelle_valeur: string | null
          propose_par: string
          statut: string
          traite_le: string | null
          traite_par: string | null
        }
        Insert: {
          ancienne_valeur?: string | null
          champ_modifie: string
          commentaire?: string | null
          contrat_id: string
          created_at?: string
          id?: string
          nouvelle_valeur?: string | null
          propose_par: string
          statut?: string
          traite_le?: string | null
          traite_par?: string | null
        }
        Update: {
          ancienne_valeur?: string | null
          champ_modifie?: string
          commentaire?: string | null
          contrat_id?: string
          created_at?: string
          id?: string
          nouvelle_valeur?: string | null
          propose_par?: string
          statut?: string
          traite_le?: string | null
          traite_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrat_modifications_proposees_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrat_modifications_proposees_propose_par_fkey"
            columns: ["propose_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrat_modifications_proposees_traite_par_fkey"
            columns: ["traite_par"]
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
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
          last_sign_in_at: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          last_sign_in_at?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_sign_in_at?: string | null
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
      can_access_activite: {
        Args: { _activite_id: string; _user_id: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
