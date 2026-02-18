import MapEditor from './components/MapEditor';
import { MainLayout } from './components/Layout/MainLayout';
import { ThemeProvider } from './context/ThemeContext';
import { EditorProvider } from './context/EditorContext';
import React from 'react'; // Add React just in case

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
