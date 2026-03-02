import { useState } from 'react'

function Versions(): React.JSX.Element {
  type VersionsInfo = { electron: string; chrome: string; node: string }
  type ElectronWindow = Window & { electron?: { process?: { versions?: VersionsInfo } } }

  const windowWithElectron = window as ElectronWindow
  const [versions] = useState<VersionsInfo>(
    windowWithElectron.electron?.process?.versions ?? {
      electron: 'unknown',
      chrome: 'unknown',
      node: 'unknown'
    }
  )

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
