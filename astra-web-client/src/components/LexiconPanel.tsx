
import React from 'react';
import { useLexiconStore } from '../store/lexiconStore';
import { X, BookOpen, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

export const LexiconPanel: React.FC = () => {
  const { isPanelOpen, explanation, isLoading, error, closePanel, term } = useLexiconStore();

  // Show panel when it's open, regardless of content (to prevent disappearing)
  if (!isPanelOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-md z-50 animate-in slide-in-from-bottom-2 duration-300">
      <Card className="shadow-lg border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">
                Lexicon: <span className="italic font-normal text-muted-foreground">{term}</span>
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={closePanel}
              className="h-8 w-8 p-0 hover:bg-muted"
            >
              <X size={16} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-60 overflow-y-auto">
            {isLoading && !explanation ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading explanation...</span>
                </div>
              </div>
            ) : error ? (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <p className="font-medium">Error loading explanation</p>
                <p className="text-xs mt-1 opacity-80">{error}</p>
              </div>
            ) : explanation ? (
              <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap">{explanation}</div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic py-4 text-center">
                No explanation available
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
