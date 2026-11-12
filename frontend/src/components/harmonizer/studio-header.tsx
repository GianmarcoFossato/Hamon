"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Layers,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HarmonizationProfile } from "@/lib/types";

interface StudioHeaderProps {
  jobId: string;
  filename: string;
  collections: string[];
  selectedCollection: string;
  onCollectionChange: (col: string) => void;
  profiles: HarmonizationProfile[];
  onLoadProfile: (profile: HarmonizationProfile) => void;
  onSaveProfile: (name: string) => void;
  commitMode: "append" | "upsert";
  onCommitModeChange: (mode: "append" | "upsert") => void;
  businessKey: string;
  onBusinessKeyChange: (key: string) => void;
  onCommit: () => void;
  isCommitting: boolean;
  onAutoMatch: () => void;
  isMatching: boolean;
}

export function StudioHeader({
  jobId,
  filename,
  collections,
  selectedCollection,
  onCollectionChange,
  profiles,
  onLoadProfile,
  onSaveProfile,
  commitMode,
  onCommitModeChange,
  businessKey,
  onBusinessKeyChange,
  onCommit,
  isCommitting,
  onAutoMatch,
  isMatching,
}: StudioHeaderProps) {
  const [profileNameInput, setProfileNameInput] = useState("");
  const [showSaveProfile, setShowSaveProfile] = useState(false);

  const handleSave = () => {
    if (!profileNameInput.trim()) return;
    onSaveProfile(profileNameInput.trim());
    setProfileNameInput("");
    setShowSaveProfile(false);
  };

  return (
    <header className="border-b border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Left: Back Link & Document Details */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="iconXs" title="Back to Studio">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Harmonization Studio
              </h1>
              <Badge variant="outline" className="text-[10px] py-0">
                {filename || "Extracted Job"}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500">
              Map and transform extracted data to enterprise MongoDB collections
            </p>
          </div>
        </div>

        {/* Center / Right Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Target Collection Selector */}
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-slate-400" />
            <Select
              value={selectedCollection}
              onValueChange={onCollectionChange}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Select Target Collection" />
              </SelectTrigger>
              <SelectContent>
                {collections.length === 0 ? (
                  <SelectItem value="enterprise_invoices">
                    enterprise_invoices
                  </SelectItem>
                ) : (
                  collections.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Auto Match Button */}
          <Button
            variant="outline"
            size="xs"
            onClick={onAutoMatch}
            disabled={isMatching || !selectedCollection}
            className="h-8 gap-1 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            <span>{isMatching ? "Matching..." : "Auto Match"}</span>
          </Button>

          {/* Load Profile Dropdown */}
          {profiles.length > 0 && (
            <Select
              onValueChange={(val) => {
                const found = profiles.find((p) => p.id === val || p.name === val);
                if (found) onLoadProfile(found);
              }}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Load Profile..." />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id || p.name} value={p.id || p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Save Profile Button */}
          {showSaveProfile ? (
            <div className="flex items-center gap-1">
              <Input
                placeholder="Profile name"
                value={profileNameInput}
                onChange={(e) => setProfileNameInput(e.target.value)}
                className="h-8 w-32 text-xs"
              />
              <Button size="xs" onClick={handleSave} className="h-8 text-xs">
                Save
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setShowSaveProfile(false)}
                className="h-8 text-xs"
              >
                ✕
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setShowSaveProfile(true)}
              className="h-8 gap-1 text-xs"
            >
              <Save className="h-3 w-3" />
              <span>Save Profile</span>
            </Button>
          )}

          {/* Commit Mode Selector */}
          <div className="flex items-center gap-1">
            <Select
              value={commitMode}
              onValueChange={(val) => onCommitModeChange(val as "append" | "upsert")}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="append">Append</SelectItem>
                <SelectItem value="upsert">Upsert</SelectItem>
              </SelectContent>
            </Select>

            {commitMode === "upsert" && (
              <Input
                placeholder="Business Key (e.g. invoice_id)"
                value={businessKey}
                onChange={(e) => onBusinessKeyChange(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            )}
          </div>

          {/* Commit to Enterprise DB CTA */}
          <Button
            size="xs"
            onClick={onCommit}
            disabled={isCommitting || !selectedCollection}
            className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs text-xs font-semibold"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{isCommitting ? "Committing..." : "Commit to MongoDB"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
