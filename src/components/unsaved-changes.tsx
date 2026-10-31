import { useBlocker } from "@tanstack/react-router";
import { useApp } from "@/lib/app";
import { useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export function useDiscardConfirmation() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  return {
    pending,
    request: (dirty: boolean, action: () => void) => { if (dirty) setPending(() => action); else action(); },
    cancel: () => setPending(null),
    confirm: () => { const action = pending; setPending(null); action?.(); },
  };
}

export function UnsavedChanges({ dirty, discard }: { dirty: boolean; discard?: ReturnType<typeof useDiscardConfirmation> }) {
  const { t, lang } = useApp();
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: dirty, withResolver: true });
  return (
    <AlertDialog open={blocker.status === "blocked" || !!discard?.pending} onOpenChange={(open) => { if (!open) { blocker.reset?.(); discard?.cancel(); } }}>
      <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle>{t.navigation.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.navigation.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel onClick={() => { blocker.reset?.(); discard?.cancel(); }}>{t.navigation.stay}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (discard?.pending) discard.confirm(); else blocker.proceed?.(); }}>{t.navigation.leave}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}