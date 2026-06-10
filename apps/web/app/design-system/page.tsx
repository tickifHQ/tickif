import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { Checkbox } from '@repo/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { ModeToggle } from '@repo/ui/components/mode-toggle';
import { Separator } from '@repo/ui/components/separator';
import { Skeleton } from '@repo/ui/components/skeleton';
import { Switch } from '@repo/ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import { Textarea } from '@repo/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import type { ReactNode } from 'react';

const swatches = [
  ['background', 'bg-background border'],
  ['foreground', 'bg-foreground'],
  ['card', 'bg-card border'],
  ['primary', 'bg-primary'],
  ['secondary', 'bg-secondary'],
  ['muted', 'bg-muted'],
  ['accent', 'bg-accent'],
  ['destructive', 'bg-destructive'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['info', 'bg-info'],
  ['border', 'bg-border'],
] as const;

function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex scroll-mt-8 animate-in flex-col gap-5 fill-mode-backwards duration-700 fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${150 + index * 90}ms` }}
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-primary">{String(index + 1).padStart(2, '0')}</span>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <Separator className="ml-2 flex-1" />
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-14 px-6 py-16">
      <header className="flex animate-in items-end justify-between gap-4 fill-mode-backwards duration-700 fade-in slide-in-from-bottom-4">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            tickif / design system
          </span>
          <h1 className="font-display text-5xl font-semibold tracking-tight">
            Warm by <em className="text-primary">design</em>.
          </h1>
          <p className="max-w-md text-balance text-muted-foreground">
            Semantic tokens, themeable via{' '}
            <code className="font-mono text-sm">data-theme</code> and dark mode. Components never
            touch raw values.
          </p>
        </div>
        <ModeToggle />
      </header>

      <Section index={0} title="Color">
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6">
          {swatches.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className={`h-16 rounded-lg shadow-xs ${cls}`} />
              <span className="font-mono text-xs text-muted-foreground">--{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section index={1} title="Type">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <p className="font-display text-4xl font-semibold tracking-tight">
              A 3BHK in Indiranagar, <em>reimagined</em>
            </p>
            <p className="max-w-xl text-base leading-relaxed">
              Body — Hanken Grotesk. Discover real interior design projects across India, told
              through the homes people actually live in.
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              mono — tickif.design.tokens v0.1
            </p>
          </CardContent>
        </Card>
      </Section>

      <Section index={2} title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section index={3} title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      </Section>

      <Section index={4} title="Alerts">
        <div className="flex flex-col gap-3">
          <Alert>
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Default alert on the card surface.</AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertTitle>Project published</AlertTitle>
            <AlertDescription>Your project is now live.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Upload failed</AlertTitle>
            <AlertDescription>The image exceeds the size limit.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section index={5} title="Form">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Project details</CardTitle>
            <CardDescription>All controls draw from semantic tokens.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ds-name">Name</Label>
              <Input id="ds-name" placeholder="3BHK in Indiranagar" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ds-desc">Description</Label>
              <Textarea id="ds-desc" placeholder="A warm, mid-century inspired home…" />
            </div>
            <div className="flex items-center gap-2.5">
              <Checkbox id="ds-publish" />
              <Label htmlFor="ds-publish">Publish immediately</Label>
            </div>
            <div className="flex items-center gap-2.5">
              <Switch id="ds-notify" />
              <Label htmlFor="ds-notify">Email notifications</Label>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button>Save</Button>
            <Button variant="ghost">Cancel</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section index={6} title="Overlays & navigation">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Delete project?</DialogTitle>
                <DialogDescription>This action cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost">Cancel</Button>
                <Button variant="destructive">Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Open menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>My account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>Tooltips use inverted surface tokens.</TooltipContent>
          </Tooltip>
        </div>

        <Tabs defaultValue="photos" className="max-w-md">
          <TabsList>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="photos" className="text-sm text-muted-foreground">
            Project photo gallery.
          </TabsContent>
          <TabsContent value="details" className="text-sm text-muted-foreground">
            Materials, budget, timeline.
          </TabsContent>
          <TabsContent value="reviews" className="text-sm text-muted-foreground">
            Homeowner reviews.
          </TabsContent>
        </Tabs>
      </Section>

      <Section index={7} title="Misc">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback>TK</AvatarFallback>
          </Avatar>
          <Separator orientation="vertical" className="h-10" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </Section>

      <footer className="border-t pt-6">
        <p className="font-mono text-xs text-muted-foreground">
          theme: tickif · switch via data-theme · values pending figma sync
        </p>
      </footer>
    </main>
  );
}
