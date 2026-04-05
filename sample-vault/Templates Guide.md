---
title: Templates Guide
tags: [template, productivity, workflow]
created: 2024-01-15
---

# Templates Guide

Templates help you quickly create structured notes with predefined content.

## How to Use Templates

1. Press `Ctrl+P` to open the command palette
2. Type "Insert Template" 
3. Select from available templates

Or use the template modal directly from the ribbon.

## Available Template Variables

Templates support these automatic variables:

- `{{date}}` - Current date (YYYY-MM-DD)
- `{{time}}` - Current time (HH:MM)
- `{{datetime}}` - Full date and time
- `{{title}}` - Current note title
- `{{timestamp}}` - Unix timestamp

## Example Template: Daily Note

```markdown
---
date: {{date}}
type: daily
---

# {{date}} - Daily Note

## Morning Routine
- [ ] Review calendar
- [ ] Check messages
- [ ] Plan priorities

## Today's Tasks
- [ ] 

## Notes

## Evening Reflection
```

## Example Template: Meeting Notes

```markdown
---
date: {{date}}
type: meeting
attendees: []
---

# Meeting: {{title}}

**Date:** {{date}} {{time}}
**Attendees:** 

## Agenda
1. 

## Discussion Points

## Action Items
- [ ] 

## Next Steps
```

## Related Notes

- [[Feature Showcase]] - See all features
- [[Markdown Guide]] - Markdown syntax help
- [[Knowledge Management]] - Organization tips

#template #guide #productivity
