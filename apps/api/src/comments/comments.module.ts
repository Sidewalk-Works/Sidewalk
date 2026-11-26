import { Module } from "@nestjs/common";
import { ActivityModule } from "../activity/activity.module";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";

@Module({
  imports: [ActivityModule],
  controllers: [CommentsController],
  providers: [CommentsService]
})
export class CommentsModule {}
