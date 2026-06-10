import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, Pencil, ImagePlus, X, Camera, Loader2, Check } from "lucide-react";
import type { ReferenceImageInput } from "@/lib/api";
import { useUser } from "@/contexts/UserContext";
import { fileToPortraitDataUrl } from "@/lib/avatar";

interface EditImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerate: (opts: { prompt?: string; referenceImage?: ReferenceImageInput }) => void;
  /** Suffix to keep data-testid values unique across the two places this dialog is used. */
  testIdSuffix?: string;
}

/** apiRequest throws `Error("<status>: <body>")`; pull the human-readable
 *  message out of the JSON body, or fall back to the raw error message (e.g. a
 *  client-side image-decode failure that never reached the server). */
function readApiError(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const brace = msg.indexOf("{");
  if (brace >= 0) {
    try {
      const body = JSON.parse(msg.slice(brace));
      return body.error || body.detail || null;
    } catch {
      // not JSON — fall through
    }
  }
  return msg || null;
}

/** The currently chosen reference image: either a user-uploaded file or the
 *  student's stored self-portrait. */
type SelectedReference =
  | { kind: "upload"; base64Data: string; mimeType: string; previewUrl: string }
  | { kind: "self"; url: string; previewUrl: string };

export function EditImageDialog({
  open,
  onOpenChange,
  onRegenerate,
  testIdSuffix = "",
}: EditImageDialogProps) {
  const { currentUser, generateSelfPortrait } = useUser();
  const [customPrompt, setCustomPrompt] = useState("");
  const [reference, setReference] = useState<SelectedReference | null>(null);
  const [isCreatingPortrait, setIsCreatingPortrait] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);

  const selfPortraitUrl = currentUser?.selfPortraitUrl;

  const handleUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const base64Data = dataUrl.split(",")[1];
      setReference({
        kind: "upload",
        base64Data,
        mimeType: file.type || "image/png",
        previewUrl: dataUrl,
      });
    } catch (error) {
      console.error("Failed to read reference image:", error);
    }
  };

  const handlePortraitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !currentUser) return;
    setPortraitError(null);
    setIsCreatingPortrait(true);
    try {
      const dataUrl = await fileToPortraitDataUrl(file);
      const url = await generateSelfPortrait(currentUser.id, dataUrl);
      // Auto-select the freshly created portrait as the reference.
      setReference({ kind: "self", url, previewUrl: url });
    } catch (error) {
      console.error("Failed to create self-portrait:", error);
      setPortraitError(readApiError(error) || "Couldn't create the avatar. Please try again.");
    } finally {
      setIsCreatingPortrait(false);
    }
  };

  const submit = (prompt?: string) => {
    let referenceImage: ReferenceImageInput | undefined;
    if (reference?.kind === "upload") {
      referenceImage = { base64Data: reference.base64Data, mimeType: reference.mimeType };
    } else if (reference?.kind === "self") {
      referenceImage = { url: reference.url, name: "the main character (the student)" };
    }
    onRegenerate({ prompt, referenceImage });
    setCustomPrompt("");
    setReference(null);
  };

  const isSelfSelected = reference?.kind === "self";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl" data-testid={`dialog-edit-image${testIdSuffix}`}>
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Button
            onClick={() => submit()}
            className="min-h-12 text-base font-semibold rounded-xl"
            data-testid={`button-regenerate-default${testIdSuffix}`}
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Generate New Image
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or describe what you want
              </span>
            </div>
          </div>

          <Input
            placeholder="e.g. a cartoon cat playing outside"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customPrompt.trim()) {
                submit(customPrompt.trim());
              }
            }}
            data-testid={`input-custom-prompt${testIdSuffix}`}
          />

          {/* Reference image section */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUploadChange}
            data-testid={`input-reference-image${testIdSuffix}`}
          />
          <input
            ref={portraitInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePortraitChange}
            data-testid={`input-self-portrait${testIdSuffix}`}
          />

          {reference && (
            <div className="flex items-center gap-3 rounded-xl border p-2">
              <img
                src={reference.previewUrl}
                alt="Reference"
                className="h-14 w-14 rounded-lg object-cover"
              />
              <span className="flex-1 text-sm text-muted-foreground">
                {reference.kind === "self" ? "Using your avatar" : "Reference image attached"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setReference(null)}
                aria-label="Remove reference image"
                data-testid={`button-remove-reference${testIdSuffix}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {!reference && (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-12 text-base rounded-xl border-dashed"
              data-testid={`button-add-reference${testIdSuffix}`}
            >
              <ImagePlus className="w-5 h-5 mr-2" />
              Add reference image
            </Button>
          )}

          {/* Self-portrait avatar: a one-click reference of the student */}
          {currentUser && (
            <>
              {isCreatingPortrait ? (
                <div
                  className="flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm text-muted-foreground"
                  data-testid={`status-creating-portrait${testIdSuffix}`}
                >
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating your avatar…
                </div>
              ) : selfPortraitUrl ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setReference({ kind: "self", url: selfPortraitUrl, previewUrl: selfPortraitUrl })
                    }
                    className={`flex flex-1 items-center gap-3 rounded-xl border p-2 text-left transition-colors hover:bg-accent ${
                      isSelfSelected ? "border-primary ring-2 ring-primary/30" : ""
                    }`}
                    data-testid={`button-use-self-portrait${testIdSuffix}`}
                  >
                    <img
                      src={selfPortraitUrl}
                      alt="Your avatar"
                      className="h-12 w-12 rounded-full object-cover"
                    />
                    <span className="flex-1 text-sm font-medium">
                      {isSelfSelected ? "Avatar selected" : "Use my avatar"}
                    </span>
                    {isSelfSelected && <Check className="w-5 h-5 text-primary" />}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => portraitInputRef.current?.click()}
                    aria-label="Recreate avatar from a new photo"
                    title="Recreate from a new photo"
                    data-testid={`button-recreate-self-portrait${testIdSuffix}`}
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => portraitInputRef.current?.click()}
                  className="min-h-12 text-base rounded-xl border-dashed"
                  data-testid={`button-create-self-portrait${testIdSuffix}`}
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Create avatar from photo
                </Button>
              )}
              {portraitError && (
                <p className="text-xs text-destructive" data-testid={`text-portrait-error${testIdSuffix}`}>
                  {portraitError}
                </p>
              )}
            </>
          )}

          <Button
            onClick={() => submit(customPrompt.trim())}
            disabled={!customPrompt.trim() && !reference}
            variant="secondary"
            className="min-h-12 text-base font-semibold rounded-xl"
            data-testid={`button-regenerate-custom${testIdSuffix}`}
          >
            <Pencil className="w-5 h-5 mr-2" />
            Generate with Description
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
