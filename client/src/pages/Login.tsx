import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, type Language } from '@/contexts/UserContext';
import { User, Plus, Globe } from 'lucide-react';

export default function Login() {
  const { users, selectUser, createUser, isLoading } = useUser();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('russian');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateUser = async () => {
    if (!newUsername.trim()) {
      setError('Please enter a name');
      return;
    }
    
    setIsCreating(true);
    setError(null);
    
    try {
      await createUser(newUsername.trim(), selectedLanguage);
    } catch (err: any) {
      if (err.message?.includes('409')) {
        setError('This name is already taken');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center overflow-hidden bg-gradient-to-b from-sky-100 to-sky-200 dark:from-sky-900 dark:to-sky-950">
        <div className="text-2xl font-bold text-sky-700 dark:text-sky-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-sky-100 to-sky-200 dark:from-sky-900 dark:to-sky-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-sky-700 dark:text-sky-300 mb-2">
            Mova
          </h1>
          <p className="text-lg text-sky-600 dark:text-sky-400">
            Learn new languages with fun!
          </p>
        </div>

        {!showCreateForm ? (
          <Card className="rounded-3xl">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Who's learning today?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {users.length > 0 && (
                <div className="grid gap-3">
                  {users.map((user) => (
                    <Button
                      key={user.id}
                      variant="outline"
                      size="lg"
                      className="w-full justify-start gap-3 h-auto py-4 rounded-2xl"
                      onClick={() => selectUser(user.id)}
                      data-testid={`button-select-user-${user.id}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-800 flex items-center justify-center">
                        <User className="w-5 h-5 text-sky-600 dark:text-sky-300" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-semibold">{user.username}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {user.language === 'russian' ? 'Russian' : 'Spanish'}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
              
              <Button
                variant="default"
                size="lg"
                className="w-full rounded-2xl h-14 text-lg gap-2"
                onClick={() => setShowCreateForm(true)}
                data-testid="button-create-new-user"
              >
                <Plus className="w-5 h-5" />
                Add New Learner
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-3xl">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Create Your Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username">Your Name</Label>
                <Input
                  id="username"
                  placeholder="Enter your name"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="rounded-xl h-12 text-lg"
                  data-testid="input-username"
                />
              </div>
              
              <div className="space-y-3">
                <Label>Which language do you want to learn?</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={selectedLanguage === 'russian' ? 'default' : 'outline'}
                    className="h-20 rounded-2xl flex flex-col gap-1"
                    onClick={() => setSelectedLanguage('russian')}
                    data-testid="button-select-russian"
                  >
                    <span className="text-2xl">🇷🇺</span>
                    <span>Russian</span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedLanguage === 'spanish' ? 'default' : 'outline'}
                    className="h-20 rounded-2xl flex flex-col gap-1"
                    onClick={() => setSelectedLanguage('spanish')}
                    data-testid="button-select-spanish"
                  >
                    <span className="text-2xl">🇪🇸</span>
                    <span>Spanish</span>
                  </Button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 rounded-2xl"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewUsername('');
                    setError(null);
                  }}
                  data-testid="button-cancel-create"
                >
                  Back
                </Button>
                <Button
                  size="lg"
                  className="flex-1 rounded-2xl"
                  onClick={handleCreateUser}
                  disabled={isCreating || !newUsername.trim()}
                  data-testid="button-confirm-create"
                >
                  {isCreating ? 'Creating...' : 'Start Learning!'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
