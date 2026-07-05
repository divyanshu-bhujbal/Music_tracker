import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import InboxIcon from '@mui/icons-material/Inbox';
import type { CategoryDefinition, SongWithArtists } from '@collectio/shared';

export interface TileViewProps {
  category: CategoryDefinition;
  items: SongWithArtists[];
  isLoading: boolean;
  error: Error | null;
  onCardTap: (item: SongWithArtists) => void;
  languageMap: Map<number, string>;
}

export function TileView({
  category,
  items,
  isLoading,
  error,
  onCardTap,
  languageMap,
}: TileViewProps) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, p: 2 }}>
        <Alert severity="error" sx={{ maxWidth: 400 }}>
          {error.message}
        </Alert>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
          gap: 1,
          color: 'text.secondary',
        }}
      >
        <InboxIcon sx={{ fontSize: 48 }} />
        <Typography variant="body1">
          No {category.displayName.toLowerCase()} found
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}
      >
        {items.map((item) => (
          <Card
            key={item.id}
            sx={{
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={() => onCardTap(item)}
          >
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {item.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {item.artists.map((a) => a.display_name).join(', ') || '\u2014'}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {item.album_name ?? '\u2014'}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {languageMap.get(item.language_id) ?? '\u2014'}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
