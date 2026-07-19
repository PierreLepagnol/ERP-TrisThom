import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import { Button } from "@ERPTrisThom/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ERPTrisThom/ui/components/dropdown-menu";
import { useQuery } from "convex/react";

import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const user = useQuery(api.auth.getCurrentUser);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" />}>
        {user?.name?.split(" ")[0] ?? "Compte"}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{user?.email}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    location.reload();
                  },
                },
              });
            }}
          >
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
