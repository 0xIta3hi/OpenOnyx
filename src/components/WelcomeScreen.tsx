/**
 * Welcome Screen
 * 
 * Displayed when no vault is selected. Provides vault opening
 * and a polished first-use experience.
 */

import React from 'react';
import { FolderOpen, Plus } from 'lucide-react';

interface WelcomeScreenProps {
  onOpenVault: () => void;
}

export function WelcomeScreen({ onOpenVault }: WelcomeScreenProps) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">OpenObsidian</div>
      <h1 className="welcome-title">Welcome to OpenObsidian</h1>
      <p className="welcome-subtitle">
        A local-first knowledge management tool. Create, link, and visualize your
        notes as a connected graph — all stored securely on your device.
      </p>
      <div className="welcome-actions">
        <button className="btn btn-primary" onClick={onOpenVault} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderOpen size={18} strokeWidth={2} /> Open Vault
        </button>
        <button className="btn btn-secondary" onClick={onOpenVault} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} strokeWidth={2} /> Create New Vault
        </button>
      </div>
    </div>
  );
}
