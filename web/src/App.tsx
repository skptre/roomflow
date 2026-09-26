import { useState } from 'react'
import { Backdrop } from './scene/Backdrop'
import { StartScreen } from './ui/StartScreen'

export default function App() {
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Backdrop />
      <StartScreen
        error={notice}
        onImportFile={() => setNotice("Opening rooms isn't available in this build yet.")}
        onOpenSample={() => setNotice("Opening rooms isn't available in this build yet.")}
      />
    </main>
  )
}
