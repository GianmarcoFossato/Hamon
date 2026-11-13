"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
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
import { HarmonizationProfile } from "@/lib/types";

interface StudioHeaderProps {
  jobId?: string;
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
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5">
        {/* Left: Back Link & Document Details */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="iconXs" className="size-7" title="Back to Studio">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-xs">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-semibold tracking-tight text-foreground">
                Harmonization Studio
              </h1>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4.5 font-mono text-muted-foreground">
                {filename || "Extracted Job"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Map and transform extracted data to enterprise MongoDB collections
            </p>
          </div>
        </div>

        {/* Center / Right Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Target Collection Selector */}
          <div className="flex items-center gap-1.5">
            <Database className="size-3.5 text-muted-foreground" />
            <Select
              value={selectedCollection}
              onValueChange={onCollectionChange}
            >
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue placeholder="Target Collection" />
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
            className="h-7 gap-1 text-xs"
          >
            <Sparkles className="size-3 text-muted-foreground" />
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
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue placeholder="Profile..." />
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
                className="h-7 w-28 text-xs"
              />
              <Button size="xs" variant="default" onClick={handleSave} className="h-7 text-xs">
                Save
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setShowSaveProfile(false)}
                className="h-7 text-xs px-1.5"
              >
                ✕
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setShowSaveProfile(true)}
              className="h-7 gap-1 text-xs"
            >
              <Save className="size-3" />
              <span>Save</span>
            </Button>
          )}

          {/* Commit Mode Selector */}
          <div className="flex items-center gap-1">
            <Select
              value={commitMode}
              onValueChange={(val) => onCommitModeChange(val as "append" | "upsert")}
            >
              <SelectTrigger className="h-7 w-22 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="append">Append</SelectItem>
                <SelectItem value="upsert">Upsert</SelectItem>
              </SelectContent>
            </Select>

            {commitMode === "upsert" && (
              <Input
                placeholder="Key (e.g. invoice_id)"
                value={businessKey}
                onChange={(e) => onBusinessKeyChange(e.target.value)}
                className="h-7 w-32 text-xs"
              />
            )}
          </div>

          {/* Commit to Enterprise DB CTA */}
          <Button
            size="xs"
            variant="default"
            onClick={onCommit}
            disabled={isCommitting || !selectedCollection}
            className="h-7 gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Send className="size-3" />
            <span>{isCommitting ? "Committing..." : "Commit"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
