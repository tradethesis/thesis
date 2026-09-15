import { FollowThesis } from "../calls/FollowThesis";

export function SaveThesis({ slug, title }: { slug: string; title: string }) {
  return <FollowThesis slug={slug} title={title} explain />;
}
