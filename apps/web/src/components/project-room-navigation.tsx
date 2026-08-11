'use client';

import { useState, type MouseEvent } from 'react';
import { cn } from '@repo/ui/lib/utils';

type ProjectRoomNavigationItem = {
  id: string;
  name: string;
  photoCount: number;
};

export function ProjectRoomNavigation({ rooms }: { rooms: ProjectRoomNavigationItem[] }) {
  const [activeRoomId, setActiveRoomId] = useState(rooms[0]?.id ?? null);

  if (rooms.length === 0) return null;

  function handleRoomClick(event: MouseEvent<HTMLAnchorElement>, roomId: string) {
    event.preventDefault();
    setActiveRoomId(roomId);

    const hash = `#project-room-${roomId}`;
    window.history.pushState(null, '', hash);
    document.querySelector(hash)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  return (
    <nav
      aria-label="Project rooms"
      className="inline-flex max-w-full items-center gap-px overflow-x-auto rounded-lg bg-muted p-px"
    >
      {rooms.map((room) => {
        const active = room.id === activeRoomId;

        return (
          <a
            key={room.id}
            href={`#project-room-${room.id}`}
            aria-current={active ? 'location' : undefined}
            onClick={(event) => handleRoomClick(event, room.id)}
            className={cn(
              'flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium transition-[color,background-color,box-shadow]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{room.name}</span>
            <span className="min-w-5 rounded-full border bg-muted px-1 py-0.5 text-center text-xs leading-none text-muted-foreground">
              {room.photoCount}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
