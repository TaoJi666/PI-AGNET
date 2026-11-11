import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppEvent,
  ApprovalResponse,
  DesktopApi,
  ScheduleInput,
  SettingsInput
} from '../shared/contract'

const api: DesktopApi = {
  getSnapshot: () => ipcRenderer.invoke('desktop:snapshot'),
  createSession: () => ipcRenderer.invoke('session:create'),
  deleteSession: (id) => ipcRenderer.invoke('session:delete', id),
  renameSession: (id, title) => ipcRenderer.invoke('session:rename', id, title),
  exportSession: (id) => ipcRenderer.invoke('session:export', id),
  send: (sessionId, text) => ipcRenderer.invoke('chat:send', sessionId, text),
  abort: (sessionId) => ipcRenderer.invoke('chat:abort', sessionId),
  saveSettings: (input: SettingsInput) => ipcRenderer.invoke('settings:save', input),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  respondApproval: (response: ApprovalResponse) => ipcRenderer.invoke('approval:respond', response),
  createIdea: (title, prompt) => ipcRenderer.invoke('idea:create', title, prompt),
  deleteIdea: (id) => ipcRenderer.invoke('idea:delete', id),
  saveSchedule: (input: ScheduleInput) => ipcRenderer.invoke('schedule:save', input),
  setScheduleEnabled: (id, enabled) => ipcRenderer.invoke('schedule:enabled', id, enabled),
  deleteSchedule: (id) => ipcRenderer.invoke('schedule:delete', id),
  runSchedule: (id) => ipcRenderer.invoke('schedule:run', id),
  runWorkflow: (id, values) => ipcRenderer.invoke('workflow:run', id, values),
  listFiles: (query) => ipcRenderer.invoke('files:list', query),
  onEvent: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AppEvent): void =>
      handler(payload)
    ipcRenderer.on('app:event', listener)
    return () => ipcRenderer.removeListener('app:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
