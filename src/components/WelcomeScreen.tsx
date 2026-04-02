/**
 * Welcome Screen
 * 
 * Displayed when no vault is selected. Provides vault opening
 * and a polished first-use experience.
 */

import React from 'react';
import { FolderOpen, Plus, Network } from 'lucide-react';

interface WelcomeScreenProps {
  onOpenVault: () => void;
}

export function WelcomeScreen({ onOpenVault }: WelcomeScreenProps) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">
        <Network size={64} strokeWidth={1.5} />
      </div>
      <h1 className="welcome-title">OpenObsidian</h1>
      <p className="welcome-subtitle">
        Your local-first knowledge base. Create, link, and visualize your thoughts as an interconnected graph.
      </p>
      <div className="welcome-actions">
        <button className="btn btn-primary" onClick={onOpenVault} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', fontSize: '16px' }}>
          <FolderOpen size={18} strokeWidth={2} /> Open Vault
        </button>
        <button className="btn btn-secondary" onClick={onOpenVault} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', fontSize: '16px' }}>
          <Plus size={18} strokeWidth={2} /> Create Vault
        </button>
      </div>
    </div>
  );
}
