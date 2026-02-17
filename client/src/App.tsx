import MapEditor from './components/MapEditor';
import { MainLayout } from './components/Layout/MainLayout';
import { ThemeProvider } from './context/ThemeContext';
import { EditorProvider } from './context/EditorContext';

function App() {
  return (
    <ThemeProvider>
      <EditorProvider>
        <MainLayout>
          <MapEditor />
        </MainLayout>
      </EditorProvider>
    </ThemeProvider>
  )
}

export default App
