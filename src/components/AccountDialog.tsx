"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountDialog({ email, children }: { email: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Password updated");
      setPw("");
      setConfirm("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-hud" />
            Account
          </DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">New password</Label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Confirm password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              placeholder="••••••••"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…
                </>
              ) : (
                "Update password"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
