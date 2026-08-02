import { describe, expect, it, beforeEach } from "vitest";
import {
  createDocument,
  createEmptyDocument,
  useDocumentStore,
} from "./documentStore";

describe("dirty state", () => {
  it("is clean when content matches what was saved", () => {
    const doc = createDocument({
      filePath: "/tmp/notes.md",
      fileName: "notes.md",
      content: "# Hello",
      savedContent: "# Hello",
      isSaving: false,
      lastSavedAt: null,
    });

    expect(doc.isDirty).toBe(false);
  });

  it("is dirty as soon as the content diverges", () => {
    const doc = createDocument({
      filePath: "/tmp/notes.md",
      fileName: "notes.md",
      content: "# Hello!",
      savedContent: "# Hello",
      isSaving: false,
      lastSavedAt: null,
    });

    expect(doc.isDirty).toBe(true);
  });

  it("treats whitespace-only differences as changes", () => {
    const doc = createDocument({
      filePath: null,
      fileName: "Untitled.md",
      content: "text\n",
      savedContent: "text",
      isSaving: false,
      lastSavedAt: null,
    });

    expect(doc.isDirty).toBe(true);
  });

  it("starts a new document clean and untitled", () => {
    const doc = createEmptyDocument();

    expect(doc.isDirty).toBe(false);
    expect(doc.filePath).toBeNull();
    expect(doc.fileName).toBe("Untitled.md");
    expect(doc.content).toBe("");
  });
});

describe("document store transitions", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      document: createEmptyDocument(),
      error: null,
    });
  });

  it("marks the document dirty when content is typed", () => {
    useDocumentStore.getState().setContent("hello");

    expect(useDocumentStore.getState().document.isDirty).toBe(true);
  });

  it("becomes clean again if the content is typed back", () => {
    const store = useDocumentStore.getState();
    store.setContent("hello");
    store.setContent("");

    expect(useDocumentStore.getState().document.isDirty).toBe(false);
  });

  it("loads a file as clean with both content fields set", () => {
    useDocumentStore.getState().loadFromDisk({
      path: "/Users/x/notes.md",
      fileName: "notes.md",
      content: "# Loaded",
    });

    const doc = useDocumentStore.getState().document;
    expect(doc.content).toBe("# Loaded");
    expect(doc.savedContent).toBe("# Loaded");
    expect(doc.isDirty).toBe(false);
    expect(doc.filePath).toBe("/Users/x/notes.md");
  });

  it("refuses a second concurrent save", () => {
    const store = useDocumentStore.getState();

    expect(store.beginSave()).toBe(true);
    expect(useDocumentStore.getState().beginSave()).toBe(false);
  });

  it("only advances savedContent to what was actually written", () => {
    const store = useDocumentStore.getState();
    store.setContent("version one");
    store.beginSave();

    // The user keeps typing while the write is in flight.
    useDocumentStore.getState().setContent("version two");

    useDocumentStore.getState().completeSave({
      content: "version one",
      filePath: "/tmp/notes.md",
      fileName: "notes.md",
    });

    const doc = useDocumentStore.getState().document;
    expect(doc.savedContent).toBe("version one");
    expect(doc.content).toBe("version two");
    // The newer edit is still unsaved, and must still show as such.
    expect(doc.isDirty).toBe(true);
    expect(doc.isSaving).toBe(false);
  });

  it("records the new path and name after Save As", () => {
    const store = useDocumentStore.getState();
    store.setContent("body");
    store.beginSave();
    useDocumentStore.getState().completeSave({
      content: "body",
      filePath: "/Users/x/renamed.md",
      fileName: "renamed.md",
    });

    const doc = useDocumentStore.getState().document;
    expect(doc.filePath).toBe("/Users/x/renamed.md");
    expect(doc.fileName).toBe("renamed.md");
    expect(doc.isDirty).toBe(false);
    expect(doc.lastSavedAt).toBeTypeOf("number");
  });

  it("clears the saving flag and keeps content when a save fails", () => {
    const store = useDocumentStore.getState();
    store.setContent("unsaved work");
    store.beginSave();

    useDocumentStore.getState().failSave({
      code: "PERMISSION_DENIED",
      message: "Permission denied.",
    });

    const state = useDocumentStore.getState();
    expect(state.document.isSaving).toBe(false);
    expect(state.document.content).toBe("unsaved work");
    expect(state.document.isDirty).toBe(true);
    expect(state.error?.code).toBe("PERMISSION_DENIED");
  });
});
