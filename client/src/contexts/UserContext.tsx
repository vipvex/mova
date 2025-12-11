import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

export type Language = 'russian' | 'spanish';

export interface User {
  id: string;
  username: string;
  language: Language;
}

interface UserContextType {
  currentUser: User | null;
  users: User[];
  isLoading: boolean;
  selectUser: (userId: string) => void;
  createUser: (username: string, language: Language) => Promise<User>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await refreshUsers();
      
      const savedUserId = localStorage.getItem('currentUserId');
      if (savedUserId) {
        try {
          const response = await fetch(`/api/users/${savedUserId}`);
          if (response.ok) {
            const user = await response.json();
            setCurrentUser(user);
          } else {
            localStorage.removeItem('currentUserId');
          }
        } catch (error) {
          console.error('Failed to restore user session:', error);
          localStorage.removeItem('currentUserId');
        }
      }
      
      setIsLoading(false);
    };
    
    init();
  }, [refreshUsers]);

  const selectUser = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (response.ok) {
        const user = await response.json();
        setCurrentUser(user);
        localStorage.setItem('currentUserId', userId);
      }
    } catch (error) {
      console.error('Failed to select user:', error);
    }
  }, []);

  const createUser = useCallback(async (username: string, language: Language): Promise<User> => {
    const response = await apiRequest('POST', '/api/users', { username, language });
    const user = await response.json();
    setUsers(prev => [...prev, user]);
    setCurrentUser(user);
    localStorage.setItem('currentUserId', user.id);
    return user;
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('currentUserId');
  }, []);

  return (
    <UserContext.Provider value={{
      currentUser,
      users,
      isLoading,
      selectUser,
      createUser,
      logout,
      refreshUsers,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
