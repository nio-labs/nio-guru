import directChat from '../manifests/direct-chat.json' with { type: 'json' };
import frontendGuru from '../manifests/frontend-guru.json' with { type: 'json' };
import backendGuru from '../manifests/backend-guru.json' with { type: 'json' };
import architectGuru from '../manifests/architect-guru.json' with { type: 'json' };
import devopsGuru from '../manifests/devops-guru.json' with { type: 'json' };
import securityGuru from '../manifests/security-guru.json' with { type: 'json' };
import debugGuru from '../manifests/debug-guru.json' with { type: 'json' };
import tradingGuru from '../manifests/trading-guru.json' with { type: 'json' };
import financeGuru from '../manifests/finance-guru.json' with { type: 'json' };
import productGuru from '../manifests/product-guru.json' with { type: 'json' };
import researchGuru from '../manifests/research-guru.json' with { type: 'json' };
import logoGuru from '../manifests/logo-guru.json' with { type: 'json' };
import dataGuru from '../manifests/data-guru.json' with { type: 'json' };
import qaGuru from '../manifests/qa-guru.json' with { type: 'json' };
import agentGuru from '../manifests/agent-guru.json' with { type: 'json' };
import docsGuru from '../manifests/docs-guru.json' with { type: 'json' };
import chefGuru from '../manifests/chef-guru.json' with { type: 'json' };
import travelGuru from '../manifests/travel-guru.json' with { type: 'json' };
import fitnessGuru from '../manifests/fitness-guru.json' with { type: 'json' };
import storyGuru from '../manifests/story-guru.json' with { type: 'json' };
import clarityGuru from '../manifests/clarity-guru.json' with { type: 'json' };

export interface GuruManifest {
  id: string;
  name: string;
  tagline: string;
  category: 'standard' | 'engineering' | 'markets' | 'product' | 'creative' | 'lifestyle' | 'custom';
  categoryLabel: string;
  icon: string;
  color: string;
  isPinned: boolean;
  systemPrompt: string;
  defaultSkills: string[];
  widgetType: 'none' | 'preview' | 'sql-explain' | 'mermaid' | 'logs' | 'checklist' | 'diff' | 'chart' | 'ratios' | 'prd' | 'citations';
  samplePrompts: string[];
}

export const DEFAULT_GURUS: GuruManifest[] = [
  directChat as GuruManifest,
  frontendGuru as GuruManifest,
  backendGuru as GuruManifest,
  architectGuru as GuruManifest,
  devopsGuru as GuruManifest,
  securityGuru as GuruManifest,
  debugGuru as GuruManifest,
  tradingGuru as GuruManifest,
  financeGuru as GuruManifest,
  productGuru as GuruManifest,
  researchGuru as GuruManifest,
  logoGuru as GuruManifest,
  dataGuru as GuruManifest,
  qaGuru as GuruManifest,
  agentGuru as GuruManifest,
  docsGuru as GuruManifest,
  chefGuru as GuruManifest,
  travelGuru as GuruManifest,
  fitnessGuru as GuruManifest,
  storyGuru as GuruManifest,
  clarityGuru as GuruManifest,
];

export const GURUS_MAP = new Map<string, GuruManifest>(
  DEFAULT_GURUS.map((guru) => [guru.id, guru])
);

export function getGuruById(id: string): GuruManifest | undefined {
  return GURUS_MAP.get(id);
}
