"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Copy,
  FilePlus,
  Layers,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast, Toaster } from "sonner";

import {
  createSchema,
  deleteSchema,
  fetchSchemas,
  type SchemaResponse,
  updateSchema,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SchemaBuilder,
  type ExtendedJSONSchema7,
  type SchemaBuilderView,
} from "@/components/ui/schema-builder";
import { Textarea } from "@/components/ui/textarea";

const BLANK_SCHEMA: ExtendedJSONSchema7 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {},
  required: [],
};

interface SchemaEditorPanelProps {
  onSchemaChange?: (
    schema: ExtendedJSONSchema7,
    activeSchema: SchemaResponse | null,
  ) => void;
}

export function SchemaEditorPanel({ onSchemaChange }: SchemaEditorPanelProps = {}) {
  const [schema, setSchema] = React.useState<ExtendedJSONSchema7>(BLANK_SCHEMA);
  const [activeSchema, setActiveSchema] = React.useState<SchemaResponse | null>(null);
  const [schemasList, setSchemasList] = React.useState<SchemaResponse[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [view, setView] = React.useState<SchemaBuilderView>("fields");

  // Save Dialog state
  const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState<boolean>(false);
  const [schemaName, setSchemaName] = React.useState<string>("");
  const [schemaDescription, setSchemaDescription] = React.useState<string>("");

  const loadTemplates = React.useCallback(async (autoSelectFirst = false) => {
    setIsLoadingTemplates(true);
    try {
      const data = await fetchSchemas();
      setSchemasList(data);
      if (autoSelectFirst && data.length > 0 && !activeSchema) {
        const first = data[0];
        setActiveSchema(first);
        const parsed = first.json_schema as unknown as ExtendedJSONSchema7;
        setSchema(parsed);
        setSchemaName(first.name);
        setSchemaDescription(first.description || "");
        onSchemaChange?.(parsed, first);
      }
    } catch (err: unknown) {
      console.warn("Could not load schema templates from API:", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [activeSchema]);

  React.useEffect(() => {
    loadTemplates(true);
  }, [loadTemplates]);

  const handleSelectTemplate = (item: SchemaResponse) => {
    setActiveSchema(item);
    const parsed = item.json_schema as unknown as ExtendedJSONSchema7;
    setSchema(parsed);
    setSchemaName(item.name);
    setSchemaDescription(item.description || "");
    onSchemaChange?.(parsed, item);
    toast.success(`Loaded "${item.name}"`);
  };

  const handleNewSchema = () => {
    setActiveSchema(null);
    setSchema(BLANK_SCHEMA);
    setSchemaName("New Extraction Schema");
    setSchemaDescription("");
    setView("fields");
    onSchemaChange?.(BLANK_SCHEMA, null);
    toast.info("Created new blank root schema");
  };

  const handleOpenSaveDialog = () => {
    if (activeSchema) {
      setSchemaName(activeSchema.name);
      setSchemaDescription(activeSchema.description || "");
    } else if (!schemaName) {
      setSchemaName("My Document Schema");
    }
    setIsSaveDialogOpen(true);
  };

  const handleUpdateCurrent = async () => {
    if (!activeSchema) return;
    if (!schemaName.trim()) {
      toast.error("Schema name is required");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateSchema(activeSchema.id, {
        name: schemaName.trim(),
        description: schemaDescription.trim() || undefined,
        json_schema: schema as unknown as Record<string, unknown>,
      });
      setActiveSchema(updated);
      await loadTemplates();
      setIsSaveDialogOpen(false);
      toast.success(`Updated "${updated.name}" successfully`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update schema";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!schemaName.trim()) {
      toast.error("Schema name is required");
      return;
    }

    setIsSaving(true);
    try {
      const created = await createSchema({
        name: schemaName.trim(),
        description: schemaDescription.trim() || undefined,
        json_schema: schema as unknown as Record<string, unknown>,
      });
      setActiveSchema(created);
      await loadTemplates();
      setIsSaveDialogOpen(false);
      toast.success(`Created "${created.name}" successfully`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create schema";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!activeSchema) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete schema "${activeSchema.name}"?`,
    );
    if (!confirmDelete) return;

    try {
      await deleteSchema(activeSchema.id);
      toast.success(`Deleted schema "${activeSchema.name}"`);
      handleNewSchema();
      await loadTemplates();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete schema";
      toast.error(msg);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-full flex flex-col space-y-4">
        <Toaster richColors position="top-right" />

      {/* Top Workbench Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        {/* Left: Active Template / Schema Title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {activeSchema ? activeSchema.name : "Unsaved Schema"}
              </h2>
              {activeSchema ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  Saved Template
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  Draft
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
              {activeSchema?.description || "Draft-07 Target JSON Schema for extraction & matching"}
            </p>
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto justify-end">
          {/* Template Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                {isLoadingTemplates ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Templates ({schemasList.length})</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-semibold">
                Available Templates
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {schemasList.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  No templates found in MongoDB.
                </div>
              ) : (
                schemasList.map((tpl) => (
                  <DropdownMenuItem
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    className="flex items-center justify-between cursor-pointer text-xs"
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-medium truncate">{tpl.name}</span>
                      {tpl.description && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {tpl.description}
                        </span>
                      )}
                    </div>
                    {activeSchema?.id === tpl.id && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => loadTemplates(false)}
                className="text-xs text-muted-foreground cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 mr-1.5" />
                Reload from Database
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New Schema Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNewSchema}
            className="gap-1.5 text-xs"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>New</span>
          </Button>

          {/* Delete Active Schema (if saved) */}
          {activeSchema && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeleteCurrent}
              className="text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs px-2"
              title="Delete this template"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Save / Update Button */}
          <Button
            type="button"
            size="sm"
            onClick={handleOpenSaveDialog}
            className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{activeSchema ? "Save / Update" : "Save Schema"}</span>
          </Button>
        </div>
      </div>

      {/* Main Schema Builder Component */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm min-h-[500px]">
        <SchemaBuilder
          value={schema}
          onValueChange={(next) => {
            setSchema(next);
            onSchemaChange?.(next, activeSchema);
          }}
          view={view}
          onViewChange={setView}
          features={{
            jsonMode: true,
            definitions: true,
          }}
          className="w-full"
        />
      </div>

      {/* Save / Update Schema Modal Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeSchema ? "Save or Update Schema" : "Save New Schema"}
            </DialogTitle>
            <DialogDescription>
              Store this Draft-07 extraction template in Hamon&apos;s MongoDB repository.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="schema-name" className="text-xs font-semibold">
                Schema Name
              </Label>
              <Input
                id="schema-name"
                value={schemaName}
                onChange={(e) => setSchemaName(e.target.value)}
                placeholder="e.g. Commercial Invoice"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="schema-desc" className="text-xs font-semibold">
                Description (Optional)
              </Label>
              <Textarea
                id="schema-desc"
                value={schemaDescription}
                onChange={(e) => setSchemaDescription(e.target.value)}
                placeholder="Extracts line items, totals, dates, and vendor IDs"
                rows={3}
                className="text-sm"
              />
            </div>

            {activeSchema && (
              <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-500 space-y-1">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Active ID:
                  </span>{" "}
                  <code className="font-mono">{activeSchema.id}</code>
                </div>
                <div>
                  You can update the existing template or save your edits as a brand-new template copy.
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSaveDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>

            {activeSchema ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAsNew}
                  disabled={isSaving}
                  className="gap-1 text-xs"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Save as Copy</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleUpdateCurrent}
                  disabled={isSaving}
                  className="gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Update Current</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleSaveAsNew}
                disabled={isSaving}
                className="gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Schema</span>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </TooltipProvider>
  );
}
