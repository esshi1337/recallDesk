import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/model';
const api: DesktopAPI = {
  exportTemplate: request => ipcRenderer.invoke('export-template', request),
  library: () => ipcRenderer.invoke('library'),
  saveGoal: goal => ipcRenderer.invoke('save-goal', goal),
  saveMilestone: milestone => ipcRenderer.invoke('save-milestone', milestone),
  deleteMilestone: id => ipcRenderer.invoke('delete-milestone', id),
  reorderMilestones: (goalId, ids) => ipcRenderer.invoke('reorder-milestones', goalId, ids),
  saveManualActivity: activity => ipcRenderer.invoke('save-manual-activity', activity),
  deleteManualActivity: id => ipcRenderer.invoke('delete-manual-activity', id),
  linkEvidence: (milestoneId, eventKey, linked) => ipcRenderer.invoke('link-evidence', milestoneId, eventKey, linked),
  importExam: () => ipcRenderer.invoke('import-exam'),
  importStudyPack: () => ipcRenderer.invoke('import-study-pack'),
  exportAttempt: id => ipcRenderer.invoke('export-attempt', id),
  saveAttemptReview: review => ipcRenderer.invoke('save-attempt-review', review),
  addStudyModule: (packId, moduleId) => ipcRenderer.invoke('add-study-module', packId, moduleId),
  openReference: url => ipcRenderer.invoke('open-reference', url),
  exportExam: exam => ipcRenderer.invoke('export-exam', exam),
  start: (exam, options) => ipcRenderer.invoke('start-attempt', exam, options),
  saveAttempt: attempt => ipcRenderer.invoke('save-attempt', attempt),
  saveNote: (key, text) => ipcRenderer.invoke('save-note', key, text),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings),
  backup: () => ipcRenderer.invoke('backup'),
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  restoreBackup: () => ipcRenderer.invoke('restore-backup'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  onBeforeClose: callback => { ipcRenderer.on('before-close', callback); return () => { ipcRenderer.removeListener('before-close', callback); }; },
  readyToClose: () => ipcRenderer.send('ready-to-close')
};
contextBridge.exposeInMainWorld('desktop', api);
