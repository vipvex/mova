# Russian Language Learning App - Design Guidelines for Children

## Design Approach

**Selected Approach**: Child-Educational Pattern (inspired by Duolingo Kids, Khan Academy Kids)
**Rationale**: Educational app for 6-year-old requires large touch targets, clear visual hierarchy, encouraging feedback, and simplified navigation optimized for emerging readers.

---

## Core Design Principles

1. **Extra-Large Interactive Elements**: All buttons and touch targets minimum 60px height for small fingers
2. **Visual Clarity**: High contrast text, generous spacing, single-column layouts
3. **Encouraging Progress**: Prominent visual feedback and achievement tracking
4. **Distraction-Free Learning**: Minimal chrome, focus on learning content
5. **Safe Exploration**: Clear navigation with no dead-ends or confusing paths

---

## Typography System

**Font Selection**: 
- Primary: Nunito (Google Fonts) - rounded, friendly, highly legible for children
- Fallback: system-ui, sans-serif

**Type Scale**:
- Hero/Welcome: text-5xl to text-6xl, font-bold
- Card Words (Russian): text-4xl, font-extrabold
- Card Words (English): text-2xl, font-semibold
- Navigation/Buttons: text-xl to text-2xl, font-bold
- Progress Stats: text-3xl, font-bold (numbers), text-lg (labels)
- Body/Instructions: text-lg to text-xl, font-medium

**Line Height**: Leading-relaxed (1.625) for all text to improve readability

---

## Layout System

**Spacing Primitives**: Tailwind units of 4, 6, 8, 12, 16
- Component padding: p-6 to p-8
- Section spacing: space-y-8 to space-y-12
- Card gaps: gap-6 to gap-8
- Button padding: px-8 py-4 to px-12 py-6

**Container Strategy**:
- Max width: max-w-4xl (centered)
- Mobile-first: Full width with px-4, expand to max-w on larger screens
- Single column throughout for simplicity

**Grid System**: 
- Avoid complex grids
- Use simple flex layouts with generous gaps
- Stack elements vertically on all viewports

---

## Component Library

### Navigation Header
- Fixed top bar: h-16 to h-20
- Large back button (left): min-w-12 min-h-12 with icon
- Progress indicator (center): Linear progress bar showing daily goal
- Streak counter (right): Flame icon + number, text-2xl

### Flashcard Display
- Centered card: Rounded corners (rounded-3xl), generous padding (p-12)
- Image container: aspect-square, max-w-md, rounded-2xl
- Russian word: Directly below image, text-4xl, font-extrabold, text-center
- Audio button: Large circular play button (w-20 h-20) overlaying or beside word
- Translation reveal: Subtle "tap to reveal" hint, then text-2xl when shown

### Action Buttons
- Extra-large size: min-h-16 to min-h-20, px-12
- Rounded: rounded-2xl
- Two-button layout: "Still Learning" and "I Know It!" side-by-side with gap-4
- Full width on mobile, max-w-xs each on tablet+
- Bold text: text-xl font-bold
- Icons: Integrate simple emoji or icons (📚 ✓)

### Progress Dashboard
- Welcome section: "Great job, [Name]!" text-4xl, font-bold
- Stats cards: Grid of 2x2 on tablet, stacked on mobile
  - Words learned today
  - Total words learned  
  - Current streak
  - Next review countdown
- Each stat: Large number (text-5xl font-bold), smaller label (text-lg)
- Daily practice button: Prominent CTA, min-h-20, text-2xl

### Practice Session Flow
1. Session start screen: "Ready to practice 5 words?" with large Start button
2. Card presentation: One card at a time, full screen focus
3. Response buttons: Clear Know It / Still Learning
4. Immediate feedback: Cheerful success state (checkmark, encouraging text)
5. Session complete: Celebration screen with stats (X/5 words practiced)

### Settings/Parent Controls
- Simple list layout with large touch targets
- Toggle switches: Large (h-8 w-14)
- Vocabulary management: Add/remove words from learning set
- Audio settings: Volume control, voice selection

---

## Interaction Patterns

**Card Interactions**:
- Tap image or play button → plays audio pronunciation
- Tap "Show Translation" → reveals English word
- Swipe gestures: Optional left (still learning) / right (know it)

**Audio Feedback**:
- Play pronunciation on tap (primary interaction)
- Success sounds (subtle chime) on correct responses
- Encouraging audio phrases periodically

**Visual Feedback**:
- Button press: Scale down slightly (scale-95)
- Success: Brief green checkmark animation (subtle, not distracting)
- Progress: Smooth progress bar fill
- No complex or lengthy animations

---

## Accessibility

**Child-Specific Considerations**:
- Touch targets: Minimum 60px for all interactive elements
- High contrast text throughout
- Audio always available, not optional
- Visual progress indicators (not just text)
- No time pressure on responses
- Forgiving navigation (easy to go back)

**Standard Accessibility**:
- Proper heading hierarchy (h1 → h2 → h3)
- Alt text for all images (Russian word + English translation)
- ARIA labels for icon buttons
- Keyboard navigation support (for parent assistance)
- Focus indicators: ring-4 ring-offset-2

---

## Images

**AI-Generated Flashcard Images**:
- Style: Bright, simple, cartoon-style illustrations
- Content: Clear representation of Russian word concept
- Format: Square (1:1 aspect ratio), consistent across all cards
- Placement: Primary focal point of each flashcard, centered above word
- Size: 300x300px minimum, displayed at max-w-sm on screen

**Hero/Welcome Screen**:
- Large welcome illustration showing friendly character or learning scene
- Placement: Top third of dashboard, centered
- Style: Matches flashcard illustration style for consistency

**Progress Celebrations**:
- Small trophy/star icons for achievements
- Placement: Within stat cards and session complete screens

---

## Screen Layouts

**Dashboard**: 
- Welcome message + hero image (top)
- Stats grid (4 large cards)
- Primary "Start Practice" button
- Recent achievements list

**Practice Session**:
- Progress indicator (top)
- Flashcard (center, 70% of viewport)
- Action buttons (bottom, fixed)

**Session Complete**:
- Celebration graphic (top)
- Session stats (center)
- "Practice More" or "Done for Today" buttons (bottom)

---

## Key Constraints

- **No complex animations**: Keep transitions simple and quick
- **Mobile-first**: Optimized for tablet/phone use
- **Single-task focus**: One flashcard at a time
- **Large everything**: Text, buttons, images all oversized for small hands
- **Encouraging tone**: Visual design should feel supportive, never punishing
- **No distractions**: Minimal UI chrome, focus on learning content