'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, Check, ChevronDown, FolderPlus, Plus } from 'lucide-react';
import { AnimatedCollapsibleContent } from '@repo/ui/components/animated-collapsible-content';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import type { ButtonVariantProps } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import {
  Carousel,
  CarouselContent,
  CarouselControls,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@repo/ui/components/carousel';
import { Checkbox } from '@repo/ui/components/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { EmptyState } from '@repo/ui/components/empty-state';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@repo/ui/components/field';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { MonthPickerField } from '@repo/ui/components/month-picker-field';
import { NumberInput } from '@repo/ui/components/number-input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@repo/ui/components/pagination';
import { RequiredFieldIndicator } from '@repo/ui/components/required-field-indicator';
import { SelectField } from '@repo/ui/components/select-field';
import { Slider } from '@repo/ui/components/slider';
import { Switch } from '@repo/ui/components/switch';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import { TagCombobox } from '@repo/ui/components/tag-combobox';
import { Textarea } from '@repo/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import { portfolioAccentStyle } from '@/lib/portfolio-accent';

const buttonOptions: { variant: NonNullable<ButtonVariantProps['variant']>; label: string }[] = [
  { variant: 'default', label: 'Primary' },
  { variant: 'soft', label: 'Soft' },
  { variant: 'secondary', label: 'Secondary' },
  { variant: 'outline', label: 'Outline' },
  { variant: 'neutral', label: 'Neutral' },
  { variant: 'inverted', label: 'Inverted' },
  { variant: 'emphasis', label: 'Emphasis' },
  { variant: 'fancy', label: 'Fancy' },
  { variant: 'ghost', label: 'Ghost' },
  { variant: 'destructive', label: 'Destructive' },
];
const buttonSizes = ['xs', 'compact', 'sm', 'fancy', 'default', 'lg', 'xl'] as const;

export function ButtonDemos() {
  const [selected, setSelected] = useState('Choose a button to check its pressed state.');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {buttonOptions.map(({ variant, label }) => (
          <Button
            key={variant}
            type="button"
            variant={variant}
            onClick={() => setSelected(`${label} selected.`)}
          >
            {label}
          </Button>
        ))}
        <Button variant="link" asChild>
          <a href="#forms">
            Link to forms <ArrowUpRight aria-hidden="true" />
          </a>
        </Button>
        <Button type="button" disabled>
          Disabled
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {buttonSizes.map((size) => (
          <Button
            key={size}
            type="button"
            size={size}
            onClick={() => setSelected(`${size} size selected.`)}
          >
            {size}
          </Button>
        ))}
        <Button
          type="button"
          size="icon"
          aria-label="Add item"
          onClick={() => setSelected('Icon action selected.')}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Add compact item"
          onClick={() => setSelected('Compact icon action selected.')}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          shape="rounded"
          variant="outline"
          onClick={() => setSelected('Rounded shape selected.')}
        >
          Rounded shape
        </Button>
      </div>
      <div
        className="flex flex-wrap items-center gap-4 rounded-popover bg-muted p-5"
        style={portfolioAccentStyle('#7A365F')}
      >
        <span className="text-sm text-muted-foreground">Custom portfolio accent</span>
        <Button type="button" onClick={() => setSelected('Custom accent selected.')}>
          Hover or focus me <ArrowUpRight aria-hidden="true" />
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {selected}
      </p>
    </div>
  );
}

export function FormDemos() {
  const [location, setLocation] = useState('bengaluru');
  const [optionalStatus, setOptionalStatus] = useState('');
  const [month, setMonth] = useState('2026-10');
  const [tags, setTags] = useState(['Warm minimalism']);
  const [tagQuery, setTagQuery] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [published, setPublished] = useState(false);
  const [budget, setBudget] = useState([50]);
  const [status, setStatus] = useState('Example data — changes stay in this preview.');

  function savePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus(
      `Preview saved: ${String(form.get('projectName'))}. ${published ? 'Published' : 'Draft'}; notifications ${notifications ? 'on' : 'off'}.`,
    );
  }

  function resetPreview() {
    setLocation('bengaluru');
    setMonth('2026-10');
    setTags(['Warm minimalism']);
    setTagQuery('');
    setPublished(false);
    setNotifications(true);
    setBudget([50]);
    setStatus('Preview reset.');
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Project details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePreview} onReset={resetPreview} className="flex flex-col gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ds-name">
                  Project name <RequiredFieldIndicator />
                </FieldLabel>
                <Input
                  id="ds-name"
                  name="projectName"
                  defaultValue="A home in Indiranagar"
                  required
                  aria-describedby="ds-name-help"
                />
                <FieldDescription id="ds-name-help">
                  A short title that helps people discover the project.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ds-description">Description</FieldLabel>
                <Textarea
                  id="ds-description"
                  name="description"
                  placeholder="Tell the story behind this home…"
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField
                  name="location"
                  label="Location"
                  placeholder="Choose a city"
                  value={location}
                  onValueChange={setLocation}
                  options={[
                    { label: 'Bengaluru', value: 'bengaluru' },
                    { label: 'Mumbai', value: 'mumbai' },
                    { label: 'Delhi', value: 'delhi' },
                  ]}
                />
                <Field>
                  <FieldLabel htmlFor="ds-area">Area (sq ft)</FieldLabel>
                  <NumberInput id="ds-area" name="area" min={1} defaultValue={1800} />
                </Field>
              </div>
              <MonthPickerField
                label="Completion month"
                value={month}
                onChange={setMonth}
                minYear={2020}
                maxYear={2030}
                helperText="Choose a month, change year, or clear the selection."
              />
              <TagCombobox
                label="Design styles"
                labelHint="Optional"
                value={tagQuery}
                tags={tags}
                onValueChange={setTagQuery}
                onAddTag={(tag) => setTags((current) => [...current, tag])}
                onRemoveTag={(tag) =>
                  setTags((current) => current.filter((existing) => existing !== tag))
                }
                options={[
                  { label: 'Warm minimalism', value: 'Warm minimalism' },
                  { label: 'Mid-century', value: 'Mid-century' },
                  { label: 'Contemporary', value: 'Contemporary' },
                ]}
              />
              <FieldSet>
                <FieldLegend>Publishing preferences</FieldLegend>
                <Field orientation="horizontal">
                  <Checkbox
                    id="ds-published"
                    checked={published}
                    onCheckedChange={(value) => setPublished(value === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="ds-published">Publish immediately</FieldLabel>
                    <FieldDescription>Try both checked and unchecked states.</FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="ds-notifications">Email notifications</FieldLabel>
                    <FieldDescription>Receive updates about this project.</FieldDescription>
                  </FieldContent>
                  <Switch
                    id="ds-notifications"
                    checked={notifications}
                    onCheckedChange={setNotifications}
                  />
                </Field>
              </FieldSet>
              <Field>
                <FieldLabel id="ds-budget-label">Budget range · {budget[0]}%</FieldLabel>
                <Slider
                  aria-labelledby="ds-budget-label"
                  value={budget}
                  onValueChange={setBudget}
                  className="my-2"
                />
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">
                Save preview <Check aria-hidden="true" />
              </Button>
              <Button type="reset" variant="outline">
                Reset
              </Button>
            </div>
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-6">
        <Card variant="muted">
          <CardHeader>
            <CardTitle className="text-xl">Control states</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ds-empty">Empty input</FieldLabel>
                <Input id="ds-empty" placeholder="Start typing…" />
              </Field>
              <Field data-invalid="true">
                <FieldLabel htmlFor="ds-invalid">Invalid email</FieldLabel>
                <Input
                  id="ds-invalid"
                  type="email"
                  defaultValue="name@"
                  aria-invalid="true"
                  aria-describedby="ds-invalid-error"
                />
                <FieldError id="ds-invalid-error">Enter a complete email address.</FieldError>
              </Field>
              <Field data-disabled="true">
                <FieldLabel htmlFor="ds-disabled">Disabled input</FieldLabel>
                <Input id="ds-disabled" disabled defaultValue="Awaiting approval" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ds-readonly">Read-only input</FieldLabel>
                <Input id="ds-readonly" readOnly value="Designer profile URL" />
              </Field>
              <SelectField
                allowEmpty
                label="Optional select"
                placeholder="All statuses"
                value={optionalStatus}
                onValueChange={setOptionalStatus}
                options={[
                  { label: 'Active', value: 'active' },
                  { label: 'Unavailable', value: 'unavailable', disabled: true },
                  { label: 'Archived', value: 'archived' },
                ]}
              />
              <SelectField
                label="Invalid select"
                placeholder="Choose a city"
                value=""
                onValueChange={() => {}}
                error="Choose a location to continue."
                options={[]}
              />
              <SelectField
                label="Disabled select"
                placeholder="Choose a city"
                value=""
                onValueChange={() => {}}
                disabled
                options={[]}
              />
              <Field data-disabled="true">
                <FieldLabel htmlFor="ds-disabled-description">Disabled textarea</FieldLabel>
                <Textarea
                  id="ds-disabled-description"
                  disabled
                  defaultValue="This project has been archived."
                />
              </Field>
              <Field orientation="horizontal" data-disabled="true">
                <Checkbox id="ds-disabled-check" disabled checked />
                <FieldLabel htmlFor="ds-disabled-check">Disabled checkbox</FieldLabel>
              </Field>
              <Field orientation="horizontal" data-disabled="true">
                <Switch id="ds-disabled-switch" disabled />
                <FieldLabel htmlFor="ds-disabled-switch">Disabled switch</FieldLabel>
              </Field>
              <Field>
                <FieldLabel id="ds-disabled-slider-label">Disabled slider</FieldLabel>
                <Slider aria-labelledby="ds-disabled-slider-label" defaultValue={[30]} disabled />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function OverlayDemos() {
  const [status, setStatus] = useState(
    'Open a dialog or menu to test focus, Escape, and selection.',
  );
  const [showDrafts, setShowDrafts] = useState(true);
  const [sort, setSort] = useState('recent');
  const [expanded, setExpanded] = useState(false);
  const [consultationFormat, setConsultationFormat] = useState('video');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Open dialog
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Preview consultation</DialogTitle>
              <DialogDescription>
                A sample dialog. Tab stays inside, Escape closes it, and focus returns to the
                trigger.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-relaxed text-foreground-secondary">
              Use the same shared surface for enquiry forms, confirmations, and account settings.
            </p>
            <SelectField
              label="Consultation format"
              placeholder="Choose a format"
              value={consultationFormat}
              onValueChange={setConsultationFormat}
              options={[
                { label: 'Video call', value: 'video' },
                { label: 'Studio visit', value: 'studio' },
              ]}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  type="button"
                  onClick={() => setStatus('Dialog confirmed. No request was sent.')}
                >
                  Confirm preview
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">
              Open menu <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Project options</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setStatus('Edit action selected.')}>
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Publish (disabled)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={showDrafts} onCheckedChange={setShowDrafts}>
              Show drafts
            </DropdownMenuCheckboxItem>
            <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              <DropdownMenuRadioItem value="recent">Most recent</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">By name</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setStatus('Destructive style selected. No data was deleted.')}
            >
              Delete preview
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost">
              Hover or focus for tooltip
            </Button>
          </TooltipTrigger>
          <TooltipContent>Useful context, available with pointer or keyboard.</TooltipContent>
        </Tooltip>
      </div>
      <p className="text-sm text-muted-foreground">
        Drafts {showDrafts ? 'visible' : 'hidden'} · sorted{' '}
        {sort === 'recent' ? 'by most recent' : 'by name'}.
      </p>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
      <div className="rounded-card border p-5">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={expanded}
          aria-controls="ds-expanded-content"
          onClick={() => setExpanded((current) => !current)}
        >
          Toggle extra details <ChevronDown aria-hidden="true" />
        </Button>
        <AnimatedCollapsibleContent open={expanded}>
          <p id="ds-expanded-content" className="pt-4 text-sm text-muted-foreground">
            This content expands, collapses, and unmounts after the transition. Reduced motion
            removes the animation.
          </p>
        </AnimatedCollapsibleContent>
      </div>
    </div>
  );
}

const exampleProjects = [
  { name: 'A home in Indiranagar', location: 'Bengaluru', status: 'Published' },
  { name: 'The courtyard apartment', location: 'Mumbai', status: 'Draft' },
  { name: 'A quiet city retreat', location: 'Delhi', status: 'Published' },
  { name: 'The garden studio', location: 'Pune', status: 'Draft' },
] as const;

export function NavigationDemos() {
  const [page, setPage] = useState(1);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-8 md:grid-cols-2">
        {(['segmented', 'line'] as const).map((variant) => (
          <Tabs key={variant} defaultValue="projects">
            <Label className="mb-2">
              {variant === 'line' ? 'Underlined tabs' : 'Segmented tabs'}
            </Label>
            <TabsList variant={variant} aria-label={`${variant} navigation`}>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
              <TabsTrigger value="private" disabled>
                Private
              </TabsTrigger>
            </TabsList>
            <TabsContent value="projects" className="pt-3 text-sm text-muted-foreground">
              Published work and project details.
            </TabsContent>
            <TabsContent value="reviews" className="pt-3 text-sm text-muted-foreground">
              Client feedback and ratings.
            </TabsContent>
          </Tabs>
        ))}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableCaption className="mb-4">Example projects · page {page} of 2</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Project</TableHead>
              <TableHead scope="col">Location</TableHead>
              <TableHead scope="col">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exampleProjects.slice((page - 1) * 2, page * 2).map((project) => (
              <TableRow key={project.name}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>{project.location}</TableCell>
                <TableCell>
                  <Badge variant={project.status === 'Published' ? 'secondary' : 'outline'}>
                    {project.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination aria-label="Example project pagination">
        <PaginationContent>
          {[1, 2].map((number) => (
            <PaginationItem key={number}>
              <PaginationLink asChild isActive={page === number}>
                <button
                  type="button"
                  aria-label={`Go to page ${number}`}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              </PaginationLink>
            </PaginationItem>
          ))}
        </PaginationContent>
      </Pagination>
    </div>
  );
}

export function MediaDemos() {
  const [added, setAdded] = useState(false);
  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className="min-w-0">
        <Carousel aria-label="Project card preview" opts={{ align: 'start' }}>
          <CarouselContent>
            {exampleProjects.map((project, index) => (
              <CarouselItem key={project.name}>
                <Card variant="subtle">
                  <CardHeader>
                    <span className="font-mono text-xs text-muted-foreground">
                      Example {String(index + 1).padStart(2, '0')}
                    </span>
                    <CardTitle className="text-section">{project.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground-secondary">{project.location}</p>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselControls className="mt-4 flex justify-end gap-2">
            <CarouselPrevious className="static inset-auto" />
            <CarouselNext className="static inset-auto" />
          </CarouselControls>
        </Carousel>
      </div>
      <Card variant="muted" className="p-8">
        <EmptyState
          icon={<FolderPlus aria-hidden="true" className="size-6" />}
          title={added ? 'Your first project is ready' : 'Your portfolio starts here'}
          description={
            added
              ? 'The example action updated this local preview.'
              : 'Show your work with thoughtful images and the story behind each space.'
          }
          action={
            <Button type="button" variant="outline" onClick={() => setAdded((current) => !current)}>
              {added ? 'Reset empty state' : 'Add sample project'}
            </Button>
          }
        />
      </Card>
    </div>
  );
}
