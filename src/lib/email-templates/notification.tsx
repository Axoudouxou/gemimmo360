import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  title?: string
  message?: string
  link?: string
  type?: string
}

const Email = ({ title, message, link }: Props) => (
  <Html lang="fr">
    <Head />
    <Preview>{title ?? 'Nouvelle notification'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>GEM Immobilier</Heading>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>{title ?? 'Nouvelle notification'}</Heading>
        <Text style={text}>{message ?? ''}</Text>
        {link && (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={link} style={btn}>Ouvrir dans le CRM</Button>
          </Section>
        )}
        <Hr style={hr} />
        <Text style={footer}>
          Vous recevez cet email parce qu'une action vous concerne dans le CRM GEM Immobilier.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    (data.title as string) || 'Nouvelle notification',
  displayName: 'Notification CRM',
  previewData: {
    title: 'Nouvelle tâche assignée',
    message: 'jean@example.com vous a assigné : Visite du 21 rue de Paris',
    link: 'https://gemimmo360.lovable.app/calendrier',
    type: 'activite_assignee',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px 28px' }
const h1 = { color: '#0f172a', fontSize: '20px', fontWeight: 700, margin: 0 }
const h2 = { color: '#0f172a', fontSize: '18px', fontWeight: 600, margin: '18px 0 8px' }
const text = { color: '#334155', fontSize: '15px', lineHeight: '22px', margin: '8px 0' }
const btn = { backgroundColor: '#0f172a', color: '#ffffff', padding: '12px 22px', borderRadius: '6px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const footer = { color: '#94a3b8', fontSize: '12px', lineHeight: '18px', margin: '12px 0 0' }
