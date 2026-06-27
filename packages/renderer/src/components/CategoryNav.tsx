import { useNavigate, useLocation } from 'react-router-dom';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import MovieIcon from '@mui/icons-material/Movie';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import CategoryIcon from '@mui/icons-material/Category';
import type { CategoryDefinition } from '@collectio/shared';
import { useCategoryList } from '@collectio/shared';

interface CategoryNavProps {
  collapsed?: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  'music-note': <MusicNoteIcon />,
  book: <LibraryBooksIcon />,
  movie: <MovieIcon />,
  games: <SportsEsportsIcon />,
};

function getCategoryIcon(iconName: string): React.ReactNode {
  return iconMap[iconName] ?? <CategoryIcon />;
}

export function CategoryNav({ collapsed = false }: CategoryNavProps) {
  const categories = useCategoryList();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (categoryId: string) => {
    if (location.pathname === '/' && categories.length > 0) {
      return categoryId === categories[0].id;
    }
    return location.pathname === `/${categoryId}`;
  };

  const handleNavigate = (category: CategoryDefinition) => {
    navigate(`/${category.id}`);
  };

  if (collapsed) {
    return (
      <List disablePadding>
        {categories.map((category) => (
          <Tooltip key={category.id} title={category.displayName} placement="right">
            <IconButton
              onClick={() => handleNavigate(category)}
              color={isActive(category.id) ? 'primary' : 'default'}
              size="small"
              aria-label={category.displayName}
            >
              {getCategoryIcon(category.iconName)}
            </IconButton>
          </Tooltip>
        ))}
      </List>
    );
  }

  return (
    <List disablePadding>
      {categories.map((category) => (
        <ListItemButton
          key={category.id}
          selected={isActive(category.id)}
          onClick={() => handleNavigate(category)}
          sx={{ borderRadius: 1, mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            {getCategoryIcon(category.iconName)}
          </ListItemIcon>
          <ListItemText primary={category.displayName} />
        </ListItemButton>
      ))}
    </List>
  );
}
