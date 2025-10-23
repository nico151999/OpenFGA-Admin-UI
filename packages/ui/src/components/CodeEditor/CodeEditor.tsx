import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type * as monacoEditor from 'monaco-editor';
import { useRef } from 'react';

// OpenFGA DSL language definition for Monaco
const OPENFGA_DSL_LANGUAGE = 'openfga-dsl';

// Register OpenFGA DSL language with Monaco
function registerOpenFGADSL(monaco: Monaco) {
  // Check if already registered
  if (
    monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === OPENFGA_DSL_LANGUAGE)
  ) {
    return;
  }

  // Register the language
  monaco.languages.register({ id: OPENFGA_DSL_LANGUAGE });

  // Define tokenization rules
  monaco.languages.setMonarchTokensProvider(OPENFGA_DSL_LANGUAGE, {
    keywords: ['model', 'schema', 'type', 'relations', 'define', 'condition'],
    operators: ['or', 'and', 'but not', 'from'],
    typeKeywords: ['self', 'this'],

    tokenizer: {
      root: [
        // Comments
        [/#.*$/, 'comment'],

        // Keywords
        [/\b(model|schema|type|relations|define|condition)\b/, 'keyword'],

        // Operators
        [/\b(or|and|but not|from)\b/, 'keyword.operator'],

        // Schema version
        [/\b\d+\.\d+\b/, 'number'],

        // Type references with relation [type#relation]
        [
          /\[\s*[a-zA-Z_][a-zA-Z0-9_]*\s*(#\s*[a-zA-Z_][a-zA-Z0-9_]*)?\s*(,\s*[a-zA-Z_][a-zA-Z0-9_]*\s*(#\s*[a-zA-Z_][a-zA-Z0-9_]*)?\s*)*\]/,
          'type.identifier',
        ],

        // Self/this reference
        [/\[\s*(self|this)\s*\]/, 'keyword'],

        // Wildcards [type:*]
        [/\[\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*\*\s*\]/, 'type.identifier'],

        // Identifiers (type names, relation names)
        [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],

        // Delimiters
        [/[:[\]]/, 'delimiter'],

        // Whitespace
        [/\s+/, 'white'],
      ],
    },
  });

  // Define language configuration (brackets, comments, etc.)
  monaco.languages.setLanguageConfiguration(OPENFGA_DSL_LANGUAGE, {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
    ],
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(type|relations)\s*$/,
      decreaseIndentPattern: /^\s*(type)\s*$/,
    },
  });

  // Define theme for DSL
  monaco.editor.defineTheme('openfga-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
      { token: 'keyword.operator', foreground: 'c586c0' },
      { token: 'type.identifier', foreground: '4ec9b0' },
      { token: 'identifier', foreground: '9cdcfe' },
      { token: 'comment', foreground: '6a9955' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'delimiter', foreground: 'd4d4d4' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#858585',
      'editorCursor.foreground': '#aeafad',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41',
    },
  });

  // Register completion provider for DSL
  monaco.languages.registerCompletionItemProvider(OPENFGA_DSL_LANGUAGE, {
    provideCompletionItems: (
      model: {
        getWordUntilPosition: (pos: { lineNumber: number; column: number }) => {
          startColumn: number;
          endColumn: number;
        };
      },
      position: { lineNumber: number; column: number }
    ) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        {
          label: 'model',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'model\n  schema 1.1\n\n',
          range,
          documentation: 'Declare an OpenFGA model',
        },
        {
          label: 'type',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'type ${1:name}\n  relations\n    define ${2:relation}: [${3:type}]',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: 'Define a type with relations',
        },
        {
          label: 'define',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'define ${1:relation}: [${2:type}]',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: 'Define a relation',
        },
        {
          label: 'relations',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'relations\n    define ',
          range,
          documentation: 'Start relations block',
        },
        {
          label: 'or',
          kind: monaco.languages.CompletionItemKind.Operator,
          insertText: 'or ',
          range,
          documentation: 'Union operator - allows access if any condition is true',
        },
        {
          label: 'and',
          kind: monaco.languages.CompletionItemKind.Operator,
          insertText: 'and ',
          range,
          documentation: 'Intersection operator - requires all conditions to be true',
        },
        {
          label: 'but not',
          kind: monaco.languages.CompletionItemKind.Operator,
          insertText: 'but not ',
          range,
          documentation: 'Exclusion operator - excludes users matching the condition',
        },
        {
          label: 'from',
          kind: monaco.languages.CompletionItemKind.Operator,
          insertText: 'from ',
          range,
          documentation: 'Tuple-to-userset - follow a relation path',
        },
        {
          label: 'condition',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'condition ${1:name}(${2:params}) {\n  ${3:expression}\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: 'Define a conditional relation',
        },
      ];

      return { suggestions };
    },
  });
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: 'openfga-dsl' | 'json';
  height?: string | number;
  readOnly?: boolean;
  onValidate?: (markers: monacoEditor.editor.IMarkerData[]) => void;
}

export function CodeEditor({
  value,
  onChange,
  language,
  height = 500,
  readOnly = false,
  onValidate,
}: CodeEditorProps) {
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Register OpenFGA DSL language
    registerOpenFGADSL(monaco);

    // Set theme
    monaco.editor.setTheme('openfga-dark');

    // Listen for validation markers
    if (onValidate) {
      monaco.editor.onDidChangeMarkers(() => {
        const model = editor.getModel();
        if (model) {
          const markers = monaco.editor.getModelMarkers({ resource: model.uri });
          onValidate(markers);
        }
      });
    }
  };

  const handleEditorChange = (newValue: string | undefined) => {
    onChange(newValue || '');
  };

  // Determine Monaco language
  const monacoLanguage = language === 'openfga-dsl' ? OPENFGA_DSL_LANGUAGE : 'json';

  return (
    <Editor
      height={height}
      language={monacoLanguage}
      value={value}
      onChange={handleEditorChange}
      onMount={handleEditorMount}
      theme="openfga-dark"
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: 'Monaco, Consolas, "Courier New", monospace',
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
        folding: true,
        renderLineHighlight: 'line',
        selectOnLineNumbers: true,
        roundedSelection: false,
        cursorStyle: 'line',
        glyphMargin: false,
        padding: { top: 8, bottom: 8 },
      }}
    />
  );
}
