# Fully Interactive Org Chart Design

## Overview
A visual, interactive hierarchical representation of the company's reporting structure, mimicking HiBob's sleek organizational visualization.

## Architecture & UI Components
- **Visualization Engine**: Use `reactflow` for the interactive canvas (zoom/pan) and `dagre` for automatic top-down layout calculation.
- **Page Route**: `/org-chart` (integrated into the sidebar).
- **EmployeeNode**: A custom React Flow node component styled to look like HiBob employee cards, showing Avatar, Name, and Job Title.
- **Interactivity**: Clicking a node opens an employee profile drawer; a search bar allows users to quickly locate and center on specific individuals.

## Data Flow
1. **tRPC Query**: `employee.getOrgChartData` fetches a flat list of active employees with `id`, `name`, `avatar`, `title`, and `managerId`.
2. **Transformation**: A client-side utility converts this flat list into the `nodes` and `edges` required by React Flow.
3. **Automatic Layout**: The layout engine calculates `x` and `y` coordinates for every node based on `managerId` relationships before the first render.

## Error Handling & Testing
- **Circular Safety**: Detection logic to prevent infinite reporting loops from crashing the UI.
- **Multi-Root Support**: Gracefully handle organizations with multiple top-level executives.
- **Unit Testing**: Focus on the data transformation logic and custom node rendering using Vitest and React Testing Library.
- **Integration Testing**: Ensure the tRPC query correctly respects multi-tenant scoping.
