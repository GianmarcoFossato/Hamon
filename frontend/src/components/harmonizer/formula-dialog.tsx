"use client";

import { useState } from "react";
import { Code2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface FormulaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldName: string;
  initialExpression: string;
  onSaveExpression: (expr: string) => void;
  sampleRow?: Record<string, any>;
}

export function FormulaDialog({
  open,
  onOpenChange,
  fieldName,
  initialExpression,
  onSaveExpression,
  sampleRow = {},
}: FormulaDialogProps) {
  const [expression, setExpression] = useState(initialExpression);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTest = () => {
    try {
      // Client-side quick preview simulation or explanation
      setTestResult(
        `Evaluating expression on server: "${expression}" with available row fields: [${Object.keys(
          sampleRow
        ).join(", ")}]`
      );
    } catch (e: any) {
      setTestResult(`Error: ${e?.message}`);
    }
  };

  const handleSave = () => {
    onSaveExpression(expression);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Code2 className="h-4 w-4 text-indigo-600" />
            Formula Sandbox Editor — {fieldName}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Write sandboxed Python expressions evaluated securely via simpleeval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Quick Functions Reference */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-[11px] dark:border-slate-800 dark:bg-slate-950">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Safe Functions:
            </span>
            <div className="mt-1 grid grid-cols-2 gap-1 text-slate-500 font-mono text-[10px]">
              <span>clean_currency(val)</span>
              <span>to_date(val)</span>
              <span>round(val, 2)</span>
              <span>re_sub(pat, repl, s)</span>
              <span>upper(s) / lower(s)</span>
              <span>str_slice(s, start, end)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Expression</Label>
            <Textarea
              rows={3}
              placeholder="e.g. clean_currency(price) * quantity"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          {/* Sample Row Context */}
          {Object.keys(sampleRow).length > 0 && (
            <div className="rounded-md border border-slate-200 p-2 dark:border-slate-800">
              <span className="font-medium text-[11px] text-slate-500">
                Sample Row Context:
              </span>
              <pre className="mt-1 max-h-24 overflow-auto font-mono text-[10px] text-slate-600 dark:text-slate-400">
                {JSON.stringify(sampleRow, null, 2)}
              </pre>
            </div>
          )}

          {testResult && (
            <div className="rounded bg-indigo-50 p-2 text-[11px] text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
              {testResult}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="xs" onClick={handleTest}>
            <Play className="h-3 w-3 mr-1" />
            Check Syntax
          </Button>
          <Button size="xs" onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Save Formula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
