import { useBlocker } from "@tanstack/react-router";
import { useApp } from "@/lib/app";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export function UnsavedChanges({ dirty }: { dirty: boolean }) {
  const { t, lang } = useApp();
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: dirty, withResolver: true });
  return (
    <AlertDialog open={blocker.status === "blocked"} onOpenChange={(open) => { if (!open) blocker.reset?.(); }}>
      <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle>{t.navigation.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.navigation.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel onClick={() => blocker.reset?.()}>{t.navigation.stay}</AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.proceed?.()}>{t.navigation.leave}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}