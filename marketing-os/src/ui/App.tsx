import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout.tsx'
import { ApprovalsPage } from './pages/Approvals.tsx'
import { AssetPage } from './pages/Asset.tsx'
import { AssetsPage } from './pages/Assets.tsx'
import { BrandPage } from './pages/Brand.tsx'
import { CampaignPage, CampaignsPage } from './pages/Campaigns.tsx'
import { CommandCenter } from './pages/CommandCenter.tsx'
import { ExperimentsPage } from './pages/Experiments.tsx'
import { IntelligencePage } from './pages/Intelligence.tsx'
import { MessagingPage } from './pages/Messaging.tsx'
import { NewAssetPage } from './pages/NewAsset.tsx'
import { ProblemPage, ProblemsPage } from './pages/Problems.tsx'
import { RepurposePage } from './pages/Repurpose.tsx'
import { SettingsPage } from './pages/Settings.tsx'
import { VoicePage } from './pages/Voice.tsx'
import { WorkspaceProvider } from './state/WorkspaceContext.tsx'

export function App() {
  return (
    <WorkspaceProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<CommandCenter />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/:id" element={<ProblemPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:id" element={<CampaignPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/new" element={<NewAssetPage />} />
            <Route path="/assets/:id" element={<AssetPage />} />
            <Route path="/repurpose" element={<RepurposePage />} />
            <Route path="/messaging" element={<MessagingPage />} />
            <Route path="/experiments" element={<ExperimentsPage />} />
            <Route path="/intelligence" element={<IntelligencePage />} />
            <Route path="/brand" element={<BrandPage />} />
            <Route path="/voice" element={<VoicePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<CommandCenter />} />
          </Routes>
        </Layout>
      </HashRouter>
    </WorkspaceProvider>
  )
}
