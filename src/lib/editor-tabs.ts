// Editor tab model shared by the tab bar component and the useEditorTabs hook.
// It lives outside src/components so state hooks never depend on UI modules.

export interface EditorTab {
  id: string;
  label: string;
  filePath?: string;
}

export const CANVAS_TAB: EditorTab = {
  id: '__canvas__',
  label: 'Canvas',
};
