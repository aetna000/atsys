/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modified for AtSys: extracted StatusLabel from common/Label.tsx;
 * use standard MUI palette tokens, typed props, and MUI Tooltip;
 * add an accessible shape marker and neutral/unknown state.
 * Upstream commit: 317ccc2009471edd275ad3c38b824a92408a1fba.
 */

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

export interface StatusLabelProps extends ComponentPropsWithoutRef<'span'> {
  status: 'success' | 'warning' | 'error' | '';
  sx?: SxProps<Theme>;
}

export const StatusLabel = forwardRef<HTMLSpanElement, StatusLabelProps>(function StatusLabel(
  { status, sx, title, children, ...other },
  ref,
) {
  const theme = useTheme();
  const palette = status ? theme.palette[status] : null;
  const isLight = theme.palette.mode === 'light';
  const foreground = palette
    ? isLight
      ? palette.dark
      : palette.light
    : theme.palette.text.secondary;
  const label = (
    <Typography
      ref={ref}
      component="span"
      {...other}
      sx={[
        {
          border: '1px solid',
          borderColor: alpha(foreground, 0.24),
          backgroundColor: alpha(foreground, isLight ? 0.08 : 0.14),
          color: foreground,
          fontSize: theme.typography.pxToRem(12),
          fontWeight: 600,
          padding: theme.spacing(0.35, 0.85),
          display: 'inline-flex',
          whiteSpace: 'nowrap',
          alignItems: 'center',
          gap: theme.spacing(0.65),
          borderRadius: '5px',
          lineHeight: 1.4,
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Box component="span" aria-hidden="true" sx={{ fontSize: 10 }}>
        {status === 'success' ? '●' : status === 'warning' ? '▲' : status === 'error' ? '◆' : '○'}
      </Box>
      {children}
    </Typography>
  );
  return title ? <Tooltip title={title}>{label}</Tooltip> : label;
});
