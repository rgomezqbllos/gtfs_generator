import MapEditor from './components/MapEditor';
import { MainLayout } from './components/Layout/MainLayout';
import { ThemeProvider } from './context/ThemeContext';
import { EditorProvider } from './context/EditorContext';
import { useAuth } from './context/AuthContext';
import { AdminPanel } from './components/AdminPanel';

function AppContent() {
  const { isSuperAdmin } = useAuth();

  if (isSuperAdmin) {
    return <AdminPanel />;
  }

  return <MapEditor />;
}

function App() {
  return (
    <ThemeProvider>
      <EditorProvider>
        <MainLayout>
          <AppContent />
        </MainLayout>
      </EditorProvider>
    </ThemeProvider>
  )
}

export default App
