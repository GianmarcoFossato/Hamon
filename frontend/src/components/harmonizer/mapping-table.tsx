"use client";

import { useState } from "react";
import { Check, Code2, Plus, Trash2 } from "lucide-react";
import { FieldMappingItem, TransformType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormulaDialog } from "./formula-dialog";

interface MappingTableProps {
  mappings: FieldMappingItem[];
  onMappingsChange: (mappings: FieldMappingItem[]) => void;
  targetFields: string[];
  sourceFields: string[];
  sampleRow?: Record<string, any>;
  onAcceptHighConfidence?: () => void;
}

const TRANSFORM_OPTIONS: { id: TransformType; label: string }[] = [
  { id: "direct", label: "Direct (as is)" },
  { id: "trim", label: "Trim (string)" },
  { id: "clean_currency", label: "Clean Currency ($ -> Float)" },
  { id: "iso_date", label: "ISO Date (YYYY-MM-DD)" },
  { id: "int", label: "Integer" },
  { id: "float", label: "Float" },
  { id: "boolean", label: "Boolean" },
  { id: "object_id", label: "ObjectId (BSON)" },
  { id: "formula", label: "Python Formula (AST Sandbox)" },
];

export function MappingTable({
  mappings,
  onMappingsChange,
  targetFields,
  sourceFields,
  sampleRow = {},
  onAcceptHighConfidence,
}: MappingTableProps) {
  const [activeFormulaIndex, setActiveFormulaIndex] = useState<number | null>(
    null
  );

  const handleUpdateMapping = (
    index: number,
    field: keyof FieldMappingItem,
    val: any
  ) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], [field]: val };
    onMappingsChange(updated);
  };

  const handleRemoveMapping = (index: number) => {
    const updated = mappings.filter((_, i) => i !== index);
    onMappingsChange(updated);
  };

  const handleAddMapping = () => {
    const nextMapping: FieldMappingItem = {
      source_path: sourceFields[0] || "",
      target_field: targetFields[0] || "",
      transform: "direct",
    };
    onMappingsChange([...mappings, nextMapping]);
  };

  const handleSaveFormula = (expr: string) => {
    if (activeFormulaIndex !== null && mappings[activeFormulaIndex]) {
      handleUpdateMapping(activeFormulaIndex, "transform_args", {
        expression: expr,
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Table Header Bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight text-foreground">
            Field Alignments ({mappings.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onAcceptHighConfidence && (
            <Button
              variant="outline"
              size="xs"
              onClick={onAcceptHighConfidence}
              className="h-7 gap-1 text-[11px]"
            >
              <Check className="size-3 text-emerald-600" />
              <span>Accept High Confidence (&ge;85%)</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="xs"
            onClick={handleAddMapping}
            className="h-7 gap-1 text-[11px]"
          >
            <Plus className="size-3" />
            <span>Add Row</span>
          </Button>
        </div>
      </div>

      {/* Main Columnar Mapping Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/30">
              <TableHead className="w-[30%] text-xs font-semibold text-muted-foreground">
                Extracted Source Field
              </TableHead>
              <TableHead className="w-[28%] text-xs font-semibold text-muted-foreground">
                Transform Recipe
              </TableHead>
              <TableHead className="w-[30%] text-xs font-semibold text-muted-foreground">
                Target Enterprise Field
              </TableHead>
              <TableHead className="w-[12%] text-xs font-semibold text-muted-foreground text-right">
                Confidence / Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-12 text-center text-xs text-muted-foreground"
                >
                  No field mappings yet. Click &quot;Auto Match&quot; or &quot;Add
                  Row&quot; to begin.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((m, idx) => {
                const conf = m.confidence ?? 0;
                const sampleVal = sampleRow[m.source_path];

                return (
                  <TableRow key={idx} className="border-b border-border hover:bg-muted/30">
                    {/* Column 1: Source Field */}
                    <TableCell className="align-middle">
                      <div className="flex flex-col gap-1">
                        <Select
                          value={m.source_path}
                          onValueChange={(val) =>
                            handleUpdateMapping(idx, "source_path", val)
                          }
                        >
                          <SelectTrigger className="h-7 text-xs font-mono">
                            <SelectValue placeholder="Select Source Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {sourceFields.map((f) => (
                              <SelectItem
                                key={f}
                                value={f}
                                className="font-mono text-xs"
                              >
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {sampleVal !== undefined && (
                          <span
                            className="max-w-[200px] truncate text-[10px] text-muted-foreground font-mono"
                            title={String(sampleVal)}
                          >
                            Sample: {String(sampleVal)}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Column 2: Transform Recipe */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={m.transform}
                          onValueChange={(val) => {
                            handleUpdateMapping(
                              idx,
                              "transform",
                              val as TransformType
                            );
                            if (val === "formula") {
                              setActiveFormulaIndex(idx);
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRANSFORM_OPTIONS.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {m.transform === "formula" && (
                          <Button
                            variant="outline"
                            size="iconXs"
                            onClick={() => setActiveFormulaIndex(idx)}
                            title="Edit Sandbox Formula"
                            className="size-7"
                          >
                            <Code2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>

                    {/* Column 3: Target Enterprise Field */}
                    <TableCell className="align-middle">
                      {targetFields.length > 0 ? (
                        <Select
                          value={m.target_field}
                          onValueChange={(val) =>
                            handleUpdateMapping(idx, "target_field", val)
                          }
                        >
                          <SelectTrigger className="h-7 text-xs font-mono">
                            <SelectValue placeholder="Select Target Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {targetFields.map((tf) => (
                              <SelectItem
                                key={tf}
                                value={tf}
                                className="font-mono text-xs"
                              >
                                {tf}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={m.target_field}
                          onChange={(e) =>
                            handleUpdateMapping(
                              idx,
                              "target_field",
                              e.target.value
                            )
                          }
                          placeholder="e.g. financials.grand_total"
                          className="h-7 text-xs font-mono"
                        />
                      )}
                    </TableCell>

                    {/* Column 4: Confidence & Delete */}
                    <TableCell className="align-middle text-right">
                      <div className="flex items-center justify-end gap-2">
                        {conf > 0 && (
                          <Badge
                            variant={
                              conf >= 0.85
                                ? "default"
                                : "secondary"
                            }
                            className="text-[10px] px-1.5 py-0 h-4.5"
                          >
                            {Math.round(conf * 100)}%
                          </Badge>
                        )}

                        <Button
                          variant="ghost"
                          size="iconXs"
                          onClick={() => handleRemoveMapping(idx)}
                          className="size-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Formula Editor Dialog */}
      {activeFormulaIndex !== null && mappings[activeFormulaIndex] && (
        <FormulaDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setActiveFormulaIndex(null);
          }}
          fieldName={mappings[activeFormulaIndex].source_path}
          initialExpression={
            mappings[activeFormulaIndex].transform_args?.expression || ""
          }
          onSaveExpression={handleSaveFormula}
          sampleRow={sampleRow}
        />
      )}
    </div>
  );
}
